import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

export const runtime = "nodejs";

const Schema = z.object({
  employee_id: z.string().uuid(),
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

  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.size)
    return NextResponse.json({ error: "Thiếu ảnh" }, { status: 400 });
  if (photo.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "Ảnh quá lớn (>5MB)" }, { status: 413 });

  const parsed = Schema.safeParse({
    employee_id: form.get("employee_id"),
    descriptor: form.get("descriptor"),
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, email, reference_photo")
    .eq("id", parsed.data.employee_id)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: "Không tìm thấy nhân viên" }, { status: 404 });

  // Upload ảnh mới
  const newPath = `${emp.email}/${Date.now()}.jpg`;
  const buf = new Uint8Array(await photo.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("faces")
    .upload(newPath, buf, { contentType: photo.type || "image/jpeg", upsert: false });
  if (upErr) return NextResponse.json({ error: "Không upload được ảnh" }, { status: 500 });

  // Update DB
  const { error: updErr } = await admin
    .from("employees")
    .update({
      reference_photo: newPath,
      face_descriptor: parsed.data.descriptor,
    })
    .eq("id", emp.id);
  if (updErr) {
    // rollback upload
    await admin.storage.from("faces").remove([newPath]).catch(() => {});
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Xoá ảnh cũ khỏi storage (fire-and-forget)
  if (emp.reference_photo) {
    await admin.storage.from("faces").remove([emp.reference_photo]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
