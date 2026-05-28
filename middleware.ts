import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

async function run(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Skip auth hoàn toàn cho các static/public paths — không gọi Supabase
  const isPublic =
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/models") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/api/health" ||
    pathname === "/api/admin/audit-absences" ||
    pathname === "/api/admin/cleanup-history";
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
  const tAuth0 = Date.now();
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase auth throw (network error, malformed cookie…) → treat as unauthenticated
    // thay vì để crash 500 khiến Safari báo "server error"
  }
  const authMs = Date.now() - tAuth0;
  response.headers.set("X-Mw-Auth-Ms", String(authMs));

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

export async function middleware(request: NextRequest) {
  const t0 = Date.now();
  const response = await run(request);
  const mwMs = Date.now() - t0;
  const authMs = Number(response.headers.get("X-Mw-Auth-Ms") ?? 0);

  // Server-Timing header — DevTools Network tab → request → Timing → "mw" / "auth"
  const prev = response.headers.get("Server-Timing");
  const timing = `mw;dur=${mwMs}, auth;dur=${authMs}`;
  response.headers.set("Server-Timing", prev ? `${prev}, ${timing}` : timing);

  // Log request chậm vào docker logs (visible qua `docker logs chamcong-a`)
  // Ngưỡng 500ms cho mw + 1500ms cho cả request (bao gồm SSR sau middleware
  // không đo được ở đây — chỉ thấy phần mw + auth).
  if (mwMs > 500) {
    const path = request.nextUrl.pathname + request.nextUrl.search;
    console.warn(`[slow-mw] ${request.method} ${path} mw=${mwMs}ms auth=${authMs}ms`);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
