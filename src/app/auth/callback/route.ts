import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

/**
 * Lấy origin THẬT của request, ưu tiên X-Forwarded-* headers do nginx set.
 * Nếu chỉ dùng `request.url` thì Next.js standalone trong Docker (HOSTNAME=0.0.0.0)
 * sẽ trả về `http://0.0.0.0:3000` — sai khi browser được redirect tới.
 */
function getPublicOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = getPublicOrigin(request);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");

  if (!code) return NextResponse.redirect(new URL("/login", origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
    );
  }

  // Có ?next=... → tôn trọng
  if (nextParam) return NextResponse.redirect(new URL(nextParam, origin));

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
  return NextResponse.redirect(new URL(dest, origin));
}
