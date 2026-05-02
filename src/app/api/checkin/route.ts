import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { haversine } from "@/lib/geo";
import { isAdminEmail } from "@/lib/utils";
import { currentTimeVN, dateVN, timeToMinutes } from "@/lib/time";
import { effectiveWorkHours } from "@/lib/workHours";

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
    .select("id, is_active, face_descriptor, is_admin, email, home_office_id, work_start_time, work_end_time")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!emp || !emp.is_active)
    return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 403 });

  const isAdmin = emp.is_admin || isAdminEmail(user.email);

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

  // Spam protection: tối đa 2 events trong 18h gần nhất (1 ca = in+out)
  if (!isAdmin) {
    const since = new Date(Date.now() - SHIFT_MAX_HOURS * 3600_000).toISOString();
    const { count: recentCount } = await admin
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", emp.id)
      .gte("checked_in_at", since);
    if ((recentCount ?? 0) >= 2) {
      return NextResponse.json(
        { error: "Bạn đã chấm công đủ 2 lần trong 18 giờ qua." },
        { status: 409 },
      );
    }
  }

  // Tìm đơn nghỉ theo giờ đã duyệt trong ngày — nếu có thì dịch giờ làm hiệu lực.
  // Vd: office 9h-18h, NV nghỉ 9-10h → effective_start = 10h (NV được đến muộn tới 10h
  // mà không tính late). NV nghỉ 16-17:30 → effective_end = 16h.
  const { data: hourlyLeave } = await admin
    .from("leave_requests")
    .select("start_time, end_time")
    .eq("employee_id", emp.id)
    .eq("leave_date", dayStr)
    .eq("category", "leave_hourly")
    .eq("status", "approved")
    .maybeSingle();

  // Apply per-employee override trước (DB columns → fallback hardcode → office)
  const base = effectiveWorkHours(
    {
      email: emp.email,
      work_start_time: emp.work_start_time,
      work_end_time: emp.work_end_time,
    },
    office.work_start_time,
    office.work_end_time,
  );
  let effectiveStart = base.start;
  let effectiveEnd   = base.end;
  if (hourlyLeave?.start_time && hourlyLeave?.end_time) {
    const lStart = timeToMinutes(hourlyLeave.start_time);
    const lEnd   = timeToMinutes(hourlyLeave.end_time);
    const wStart = timeToMinutes(effectiveStart);
    const wEnd   = timeToMinutes(effectiveEnd);
    // Nghỉ ôm đầu ngày làm → dịch start
    if (lStart <= wStart && lEnd > wStart) effectiveStart = hourlyLeave.end_time;
    // Nghỉ ôm cuối ngày làm → dịch end
    if (lEnd >= wEnd && lStart < wEnd) effectiveEnd = hourlyLeave.start_time;
  }

  // Tính late/early theo giờ làm hiệu lực (giờ VN), có hỗ trợ ca xuyên nửa đêm.
  // Vd: NV ca đêm 21:00-06:00 → endMin (360) < startMin (1260) → isNightShift.
  //   Check-out lúc 06:00 hôm sau: nowMin=360, expected = endMin+0 → diff=0, no early.
  //   Check-out lúc 05:30 hôm sau: nowMin=330, diff = 360-330 = 30 → early=30.
  //   Check-in lúc 02:00 hôm sau (rất muộn): nowMin=120, isNightShift, nowMin < endMin
  //     → diff = nowMin + 1440 - startMin = 120+1440-1260 = 300 → late=300.
  const nowMin = timeToMinutes(currentTimeVN());
  const startMin = timeToMinutes(effectiveStart);
  const endMin = timeToMinutes(effectiveEnd);
  const isNightShift = endMin < startMin;
  let late_minutes: number | null = null;
  let early_minutes: number | null = null;
  if (kind === "in") {
    const diff =
      isNightShift && nowMin < endMin
        ? nowMin + 24 * 60 - startMin
        : nowMin - startMin;
    if (diff > 0) late_minutes = diff;
  } else {
    const diff =
      isNightShift && nowMin >= startMin
        ? endMin + 24 * 60 - nowMin
        : endMin - nowMin;
    if (diff > 0) early_minutes = diff;
  }

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
