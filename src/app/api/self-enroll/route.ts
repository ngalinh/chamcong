import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

const Schema = z.object({
  name: z.string().trim().min(1).max(100),
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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("employees")
    .select("id, face_descriptor")
    .eq("email", user.email)
    .maybeSingle();

  // Đã enroll xong → không cho enroll lại. Admin phải xoá trước.
  if (existing?.face_descriptor) {
    return NextResponse.json(
      { error: "Tài khoản đã enroll. Liên hệ admin để xoá và enroll lại." },
      { status: 409 },
    );
  }

  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.size) {
    return NextResponse.json({ error: "Thiếu ảnh khuôn mặt" }, { status: 400 });
  }
  if (photo.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Ảnh quá lớn (>5MB)" }, { status: 413 });
  }

  const parsed = Schema.safeParse({
    name: form.get("name"),
    descriptor: form.get("descriptor"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const photoPath = `${user.email}/${Date.now()}.jpg`;
  const buf = new Uint8Array(await photo.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("faces")
    .upload(photoPath, buf, { contentType: photo.type || "image/jpeg", upsert: false });
  if (upErr) return NextResponse.json({ error: "Không upload được ảnh" }, { status: 500 });

  const payload = {
    user_id: user.id,
    email: user.email,
    name: parsed.data.name,
    reference_photo: photoPath,
    face_descriptor: parsed.data.descriptor,
    is_admin: isAdminEmail(user.email),
    is_active: true,
  };

  if (existing) {
    const { error } = await admin.from("employees").update(payload).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("employees").insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
