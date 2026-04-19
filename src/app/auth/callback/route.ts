import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");

  if (!code) return NextResponse.redirect(new URL("/login", url.origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  // Có ?next=... → tôn trọng
  if (nextParam) return NextResponse.redirect(new URL(nextParam, url.origin));

  // Default: admin → /admin, nhân viên → /
  // Không tự tạo employees row ở đây — home page check và redirect sang /enroll nếu cần.
  let dest = "/";
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email) {
    if (isAdminEmail(user.email)) {
      dest = "/admin";
    } else {
      const admin = createAdminClient();
      const { data: emp } = await admin
        .from("employees")
        .select("is_admin")
        .eq("email", user.email)
        .maybeSingle();
      if (emp?.is_admin) dest = "/admin";
    }
  }
  return NextResponse.redirect(new URL(dest, url.origin));
}
