import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { haversine } from "@/lib/geo";
import { isAdminEmail } from "@/lib/utils";
import { currentTimeVN, dateVN, timeToMinutes } from "@/lib/time";

const Schema = z.object({
  office_id: z.string().uuid(),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  distance_m: z.coerce.number(),
  face_match_score: z.coerce.number(),
  liveness_passed: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("id, is_active, face_descriptor, is_admin, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!emp || !emp.is_active)
    return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 403 });
  if (!emp.face_descriptor)
    return NextResponse.json({ error: "Chưa enroll khuôn mặt" }, { status: 400 });

  const isAdmin = emp.is_admin || isAdminEmail(user.email);

  const form = await request.formData();
  const file = form.get("selfie");
  if (!(file instanceof File) || !file.size)
    return NextResponse.json({ error: "Thiếu ảnh selfie" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "Ảnh selfie quá lớn" }, { status: 413 });

  const parsed = Schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success)
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  const { data: office } = await admin
    .from("offices")
    .select("id, latitude, longitude, radius_m, is_active, work_start_time, work_end_time")
    .eq("id", data.office_id)
    .maybeSingle();
  if (!office || !office.is_active)
    return NextResponse.json({ error: "Chi nhánh không hợp lệ" }, { status: 400 });

  // Geofence re-verify
  const serverDist = haversine(data.latitude, data.longitude, office.latitude, office.longitude);
  if (serverDist > office.radius_m + 20) {
    return NextResponse.json(
      { error: `Ngoài vùng chi nhánh (~${Math.round(serverDist)}m)` },
      { status: 403 },
    );
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

  // Nhân viên thường: tối đa 2 lần/ngày (1 check-in + 1 check-out)
  if (!isAdmin && count >= 2) {
    return NextResponse.json(
      { error: "Bạn đã chấm công đủ 2 lần hôm nay (check-in + check-out)." },
      { status: 409 },
    );
  }

  // Alternate in/out: chẵn (0, 2, 4…) = 'in', lẻ (1, 3…) = 'out'
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

  // Upload selfie
  const now = new Date();
  const objectPath = `${emp.id}/${now.toISOString().slice(0, 10)}/${now.getTime()}_${kind}.jpg`;
  const arrayBuf = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("selfies")
    .upload(objectPath, new Uint8Array(arrayBuf), {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (upErr) return NextResponse.json({ error: "Không upload được ảnh" }, { status: 500 });

  const { error: insErr } = await admin.from("check_ins").insert({
    employee_id: emp.id,
    office_id: office.id,
    kind,
    selfie_path: objectPath,
    latitude: data.latitude,
    longitude: data.longitude,
    distance_m: serverDist,
    face_match_score: data.face_match_score,
    liveness_passed: data.liveness_passed,
    late_minutes,
    early_minutes,
    user_agent: request.headers.get("user-agent"),
  });
  if (insErr) return NextResponse.json({ error: "Không ghi được check-in" }, { status: 500 });

  return NextResponse.json({ ok: true, kind, late_minutes, early_minutes });
}
