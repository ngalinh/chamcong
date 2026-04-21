import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth hoàn toàn cho các static/public paths — không gọi Supabase
  const isPublic =
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/models") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/api/admin/audit-absences";
  if (isPublic) return NextResponse.next();

  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Dùng getUser() nhưng Supabase SSR cache phiên trong cookies — chỉ network call
  // khi token gần hết hạn. Page sẽ tự getUser() lại để verify bảo mật.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isAuthRoute) {
    // Build redirect URL từ X-Forwarded-* (nginx) thay vì request.nextUrl
    // — vì Next.js standalone trong Docker (HOSTNAME=0.0.0.0) có thể trả URL
    // dạng http://0.0.0.0:3000 → browser redirect đi sai chỗ.
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const base = host ? `${proto}://${host}` : request.nextUrl.origin;
    const url = new URL("/login", base);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
