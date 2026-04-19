import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

/**
 * Gọi sau khi verifyOtp thành công — link auth user với row employees
 * (tạo row admin tự động nếu email nằm trong ADMIN_EMAILS).
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("employees")
    .select("id, user_id")
    .eq("email", user.email)
    .maybeSingle();

  if (existing) {
    if (!existing.user_id) {
      await admin.from("employees").update({ user_id: user.id }).eq("id", existing.id);
    }
  } else if (isAdminEmail(user.email)) {
    await admin.from("employees").insert({
      user_id: user.id,
      email: user.email,
      name: user.email.split("@")[0],
      is_admin: true,
    });
  }

  return NextResponse.json({ ok: true });
}
