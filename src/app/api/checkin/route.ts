import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { haversine } from "@/lib/geo";
import { isAdminEmail } from "@/lib/utils";
import { currentTimeVN, dateVN, timeToMinutes } from "@/lib/time";

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
    .select("id, is_active, face_descriptor, is_admin, email, home_office_id")
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

  // Đếm số lần chấm công hôm nay (theo giờ VN) để auto-infer kind
  const dayStr = dateVN(new Date());
  const dayStart = new Date(`${dayStr}T00:00:00+07:00`).toISOString();
  const dayEnd = new Date(`${dayStr}T23:59:59.999+07:00`).toISOString();
  const { data: todayCheckIns } = await admin
    .from("check_ins")
    .select("id, kind")
    .eq("employee_id", emp.id)
    .gte("checked_in_at", dayStart)
    .lte("checked_in_at", dayEnd)
    .order("checked_in_at", { ascending: true });

  const count = todayCheckIns?.length ?? 0;

  if (!isAdmin && count >= 2) {
    return NextResponse.json(
      { error: "Bạn đã chấm công đủ 2 lần hôm nay (check-in + check-out)." },
      { status: 409 },
    );
  }

  const kind: "in" | "out" = count % 2 === 0 ? "in" : "out";

  // Tính late/early theo giờ làm của chi nhánh (giờ VN)
  const nowMin = timeToMinutes(currentTimeVN());
  let late_minutes: number | null = null;
  let early_minutes: number | null = null;
  if (kind === "in") {
    const diff = nowMin - timeToMinutes(office.work_start_time);
    if (diff > 0) late_minutes = diff;
  } else {
    const diff = timeToMinutes(office.work_end_time) - nowMin;
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
