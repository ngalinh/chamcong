import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { haversine } from "@/lib/geo";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("id, is_active, face_descriptor")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!emp || !emp.is_active)
    return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 403 });
  if (!emp.face_descriptor)
    return NextResponse.json({ error: "Chưa enroll khuôn mặt" }, { status: 400 });

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

  // Re-verify geofence server-side với đúng chi nhánh client đã chọn
  const { data: office } = await admin
    .from("offices")
    .select("id, latitude, longitude, radius_m, is_active")
    .eq("id", data.office_id)
    .maybeSingle();
  if (!office || !office.is_active)
    return NextResponse.json({ error: "Chi nhánh không hợp lệ" }, { status: 400 });

  const serverDist = haversine(data.latitude, data.longitude, office.latitude, office.longitude);
  if (serverDist > office.radius_m + 20) {
    return NextResponse.json(
      { error: `Ngoài vùng chi nhánh (~${Math.round(serverDist)}m)` },
      { status: 403 },
    );
  }

  // Chặn chấm công trùng trong 4 giờ gần nhất
  const fourHoursAgo = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
  const { data: recent } = await admin
    .from("check_ins")
    .select("id")
    .eq("employee_id", emp.id)
    .gte("checked_in_at", fourHoursAgo)
    .limit(1);
  if (recent && recent.length > 0) {
    return NextResponse.json(
      { error: "Bạn đã chấm công trong 4 giờ qua" },
      { status: 409 },
    );
  }

  // Upload selfie
  const now = new Date();
  const objectPath = `${emp.id}/${now.toISOString().slice(0, 10)}/${now.getTime()}.jpg`;
  const arrayBuf = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("selfies")
    .upload(objectPath, new Uint8Array(arrayBuf), {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: "Không upload được ảnh" }, { status: 500 });
  }

  const { error: insErr } = await admin.from("check_ins").insert({
    employee_id: emp.id,
    office_id: office.id,
    selfie_path: objectPath,
    latitude: data.latitude,
    longitude: data.longitude,
    distance_m: serverDist,
    face_match_score: data.face_match_score,
    liveness_passed: data.liveness_passed,
    user_agent: request.headers.get("user-agent"),
  });
  if (insErr) {
    return NextResponse.json({ error: "Không ghi được check-in" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
