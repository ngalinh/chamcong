import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

const Schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  descriptor: z.string().transform((s, ctx) => {
    try {
      const arr = JSON.parse(s);
      if (!Array.isArray(arr) || arr.length !== 128 || !arr.every((n) => typeof n === "number")) {
        ctx.addIssue({ code: "custom", message: "Invalid descriptor" });
        return z.NEVER;
      }
      return arr as number[];
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid JSON" });
      return z.NEVER;
    }
  }),
});

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: emp } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (emp?.is_admin || isAdminEmail(user.email)) return user;
  return null;
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.size) {
    return NextResponse.json({ error: "Thiếu ảnh tham chiếu" }, { status: 400 });
  }
  if (photo.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Ảnh quá lớn (>5MB)" }, { status: 413 });
  }

  const parsed = Schema.safeParse({
    email: form.get("email"),
    name: form.get("name"),
    descriptor: form.get("descriptor"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { email, name, descriptor } = parsed.data;

  const admin = createAdminClient();

  // Upsert employee (chưa có user_id — sẽ link khi họ login lần đầu)
  const { data: existing } = await admin
    .from("employees")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  const id = existing?.id;
  const photoPath = `${email}/${Date.now()}.jpg`;
  const buf = new Uint8Array(await photo.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from("faces")
    .upload(photoPath, buf, { contentType: photo.type || "image/jpeg", upsert: false });
  if (upErr) return NextResponse.json({ error: "Không upload được ảnh" }, { status: 500 });

  if (id) {
    const { error } = await admin
      .from("employees")
      .update({ name, reference_photo: photoPath, face_descriptor: descriptor, is_active: true })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("employees").insert({
      email,
      name,
      reference_photo: photoPath,
      face_descriptor: descriptor,
      is_active: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
