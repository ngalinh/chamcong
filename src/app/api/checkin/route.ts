import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { haversine } from "@/lib/geo";
import { currentTimeVN, dateVN, timeToMinutes } from "@/lib/time";
import { computeLateEarly } from "@/lib/late-early";

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
    .select("id, latitude, longitude, radius_m, is_active, is_remote, work_start_time, work_end_time")
    .eq("id", data.office_id)
    .maybeSingle();
  if (!office || !office.is_active)
    return NextResponse.json({ error: "Chi nhánh không hợp lệ" }, { status: 400 });

  const isRemoteCheckIn = !!office.is_remote;

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

  // Tìm đơn nghỉ theo giờ HOẶC WFH ca sáng/chiều đã duyệt — cả 2 đều shift giờ làm
  // hiệu lực. Vd: office 9h-18h, NV nghỉ 9-10h hoặc WFH ca sáng 9-12:30 →
  // effective_start dịch theo, NV chỉ phải có mặt ca còn lại.
  const { data: hourlyLeave } = await admin
    .from("leave_requests")
    .select("start_time, end_time")
    .eq("employee_id", emp.id)
    .eq("leave_date", dayStr)
    .in("category", ["leave_hourly", "online_wfh"])
    .not("start_time", "is", null)
    .eq("status", "approved")
    .maybeSingle();

  // Tính late/early via shared helper (hỗ trợ multi-shift, cross-midnight, hourly leave)
  const { late_minutes, early_minutes } = computeLateEarly({
    emp: {
      email: emp.email,
      work_start_time: emp.work_start_time,
      work_end_time: emp.work_end_time,
      work_shifts: (emp.work_shifts ?? null) as Array<{ start: string; end: string }> | null,
    },
    office: { work_start_time: office.work_start_time, work_end_time: office.work_end_time },
    hourlyLeave: hourlyLeave ?? null,
    kind,
    timeMinutes: timeToMinutes(currentTimeVN()),
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
