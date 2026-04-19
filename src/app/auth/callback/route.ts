import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) return NextResponse.redirect(new URL("/login", url.origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  // Link auth user → employees row (nếu admin đã pre-create) hoặc tự tạo admin account.
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email) {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("employees")
      .select("id, user_id, is_admin")
      .eq("email", user.email)
      .maybeSingle();

    if (existing) {
      if (!existing.user_id) {
        await admin.from("employees").update({ user_id: user.id }).eq("id", existing.id);
      }
    } else if (isAdminEmail(user.email)) {
      // Bootstrap admin tự động từ ADMIN_EMAILS env — lấy tên từ Google profile
      const fullName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email.split("@")[0];
      await admin.from("employees").insert({
        user_id: user.id,
        email: user.email,
        name: fullName,
        is_admin: true,
      });
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
