import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { haversine } from "@/lib/geo";
import { currentTimeVN, dateVN, timeToMinutes } from "@/lib/time";
import { computeLateEarly } from "@/lib/late-early";
import {
  forgiveOnlineLateAfterOfficeCheckIn,
  resolveCheckinMode,
  vnDayOfWeek,
} from "@/lib/onlineCheckin";

const Schema = z.object({
  office_id: z.string().uuid(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  distance_m: z.coerce.number().optional(),
  face_match_score: z.coerce.number().optional(),
  liveness_passed: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("id, is_active, face_descriptor, email, home_office_id, work_start_time, work_end_time, work_shifts")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!emp || !emp.is_active)
    return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 403 });

  const form = await request.formData();
  const parsed = Schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success)
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  const { data: office } = await admin
    .from("offices")
    .select("id, name, latitude, longitude, radius_m, is_active, is_remote, work_start_time, work_end_time")
    .eq("id", data.office_id)
    .maybeSingle();
  if (!office || !office.is_active)
    return NextResponse.json({ error: "Chi nhánh không hợp lệ" }, { status: 400 });

  // Auto-infer kind dựa vào check-in GẦN NHẤT (không phải đếm theo ngày VN),
  // để hỗ trợ ca đêm xuyên 0h:
  //   - last="in" và elapsed < 18h → đây là check-out của ca đang mở
  //   - last="out" hoặc null hoặc elapsed > 18h → ca mới, kind=in
  const dayStr = dateVN(new Date());
  const SHIFT_MAX_HOURS = 18;
  const { data: lastCi } = await admin
    .from("check_ins")
    .select("kind, checked_in_at")
    .eq("employee_id", emp.id)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const elapsedMin = lastCi
    ? (Date.now() - new Date(lastCi.checked_in_at as string).getTime()) / 60000
    : Infinity;

  // Anti-spam: vừa chấm công < 1 phút trước → reject
  if (lastCi && elapsedMin < 1) {
    return NextResponse.json(
      { error: "Bạn vừa chấm công xong, vui lòng đợi 1 phút." },
      { status: 409 },
    );
  }

  const kind: "in" | "out" =
    lastCi?.kind === "in" && elapsedMin < SHIFT_MAX_HOURS * 60 ? "out" : "in";

  // Đơn làm online hôm nay (bất kỳ trạng thái — chỉ cần đã gửi đơn) → cho chấm online.
  const { data: onlineLeavesRaw } = await admin
    .from("leave_requests")
    .select("category, start_time, end_time")
    .eq("employee_id", emp.id)
    .eq("leave_date", dayStr)
    .in("category", ["online_rain", "online_wfh", "online_paid"]);

  const nowMin = timeToMinutes(currentTimeVN());
  const mode = resolveCheckinMode({
    emp: {
      email: emp.email,
      work_start_time: emp.work_start_time,
      work_end_time: emp.work_end_time,
      work_shifts: (emp.work_shifts ?? null) as Array<{ start: string; end: string }> | null,
    },
    officeName: office.name,
    officeStart: office.work_start_time,
    officeEnd: office.work_end_time,
    isRemoteOffice: !!office.is_remote,
    onlineLeaves: onlineLeavesRaw ?? [],
    isSaturday: vnDayOfWeek() === 6,
    nowMin,
    kind,
  });

  // Chấm online: office remote HOẶC ca hiện tại là ca online (đơn/T7 SG) → bỏ face/geo.
  const isRemoteCheckIn = mode.online;
  // Có cửa sổ ca online riêng (đơn nửa ngày / cả ngày / sáng T7) — không phải NV office remote.
  const onlineWindow = mode.online && !office.is_remote ? mode.window : null;

  // Nếu NV đã check-in vật lý ở văn phòng hôm nay, lần check-in online sau khi
  // di chuyển về nhà chỉ tiếp tục ngày làm việc, không phải một lần đi làm mới.
  // Dùng selfie_path để phân biệt check-in văn phòng với check-in online (cùng
  // được ghi nhận vào home office).
  const dayStartIso = new Date(`${dayStr}T00:00:00+07:00`).toISOString();
  const dayEndIso = new Date(`${dayStr}T24:00:00+07:00`).toISOString();
  const { data: priorOfficeCheckIn } =
    kind === "in" && isRemoteCheckIn
      ? await admin
          .from("check_ins")
          .select("id")
          .eq("employee_id", emp.id)
          .eq("kind", "in")
          .gte("checked_in_at", dayStartIso)
          .lt("checked_in_at", dayEndIso)
          .not("selfie_path", "is", null)
          .limit(1)
          .maybeSingle()
      : { data: null };

  // Validate dữ liệu cho check-in tại chi nhánh thật
  let serverDist: number | null = null;
  let objectPath: string | null = null;
  if (!isRemoteCheckIn) {
    if (!emp.face_descriptor)
      return NextResponse.json({ error: "Chưa enroll khuôn mặt" }, { status: 400 });

    const file = form.get("selfie");
    if (!(file instanceof File) || !file.size)
      return NextResponse.json({ error: "Thiếu ảnh selfie" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024)
      return NextResponse.json({ error: "Ảnh selfie quá lớn" }, { status: 413 });

    if (data.latitude == null || data.longitude == null)
      return NextResponse.json({ error: "Thiếu vị trí" }, { status: 400 });

    serverDist = haversine(data.latitude, data.longitude, office.latitude, office.longitude);
    if (serverDist > office.radius_m + 20) {
      return NextResponse.json(
        { error: "Bạn đang không ở văn phòng" },
        { status: 403 },
      );
    }

    // Upload selfie
    const nowU = new Date();
    objectPath = `${emp.id}/${nowU.toISOString().slice(0, 10)}/${nowU.getTime()}_selfie.jpg`;
    const arrayBuf = await file.arrayBuffer();
    const { error: upErr } = await admin.storage
      .from("selfies")
      .upload(objectPath, new Uint8Array(arrayBuf), {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (upErr) return NextResponse.json({ error: "Không upload được ảnh" }, { status: 500 });
  }

  // Tính late/early.
  //   - Chấm ONLINE có cửa sổ ca riêng (đơn online / sáng T7) → tính so đúng cửa
  //     sổ đó (vd đơn online cả ngày → so 9:00; sáng T7 → so 9:00 vào, 13:00 ra).
  //   - Còn lại (office, hoặc NV chi nhánh remote) → logic cũ: shift theo đơn nghỉ
  //     giờ / WFH nửa ngày / leave_paid nửa ngày ĐÃ DUYỆT.
  let late_minutes: number | null;
  let early_minutes: number | null;
  if (onlineWindow) {
    ({ late_minutes, early_minutes } = computeLateEarly({
      emp: { work_shifts: [{ start: onlineWindow.start, end: onlineWindow.end }] },
      office: { work_start_time: office.work_start_time, work_end_time: office.work_end_time },
      hourlyLeaves: [],
      kind,
      timeMinutes: nowMin,
    }));
  } else {
    const { data: hourlyLeavesRaw } = await admin
      .from("leave_requests")
      .select("start_time, end_time, category")
      .eq("employee_id", emp.id)
      .eq("leave_date", dayStr)
      .in("category", ["leave_hourly", "online_wfh", "leave_paid"])
      .not("start_time", "is", null)
      .eq("status", "approved");

    ({ late_minutes, early_minutes } = computeLateEarly({
      emp: {
        email: emp.email,
        work_start_time: emp.work_start_time,
        work_end_time: emp.work_end_time,
        work_shifts: (emp.work_shifts ?? null) as Array<{ start: string; end: string }> | null,
      },
      office: { work_start_time: office.work_start_time, work_end_time: office.work_end_time },
      hourlyLeaves: hourlyLeavesRaw ?? [],
      kind,
      timeMinutes: nowMin,
    }));
  }

  late_minutes = forgiveOnlineLateAfterOfficeCheckIn({
    kind,
    isOnline: isRemoteCheckIn,
    hadOfficeCheckInToday: !!priorOfficeCheckIn,
    lateMinutes: late_minutes,
  });

  const { error: insErr } = await admin.from("check_ins").insert({
    employee_id: emp.id,
    office_id: office.id,
    kind,
    selfie_path: objectPath,
    latitude: isRemoteCheckIn ? null : data.latitude,
    longitude: isRemoteCheckIn ? null : data.longitude,
    distance_m: serverDist,
    face_match_score: isRemoteCheckIn ? null : data.face_match_score,
    liveness_passed: isRemoteCheckIn ? null : data.liveness_passed,
    late_minutes,
    early_minutes,
    user_agent: request.headers.get("user-agent"),
  });
  if (insErr) return NextResponse.json({ error: "Không ghi được check-in" }, { status: 500 });

  // Auto-label home_office_id lần đầu chấm công ở 1 chi nhánh
  if (!emp.home_office_id) {
    await admin.from("employees").update({ home_office_id: office.id }).eq("id", emp.id);
  }

  return NextResponse.json({ ok: true, kind, late_minutes, early_minutes });
}
