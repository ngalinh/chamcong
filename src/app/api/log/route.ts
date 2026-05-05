import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/log — ghi 1 lỗi client/server vào error_logs.
 * Body JSON: { level?, message, stack?, url?, context? }
 * Auto-fill: created_at, user_agent, user_id (nếu đăng nhập), employee_id.
 *
 * Không throw nếu fail (logger không được ảnh hưởng app flow).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      level?: "error" | "warn" | "info";
      message?: string;
      stack?: string;
      url?: string;
      context?: Record<string, unknown>;
    };

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let employee_id: string | null = null;
    if (user?.email) {
      const admin = createAdminClient();
      const { data: emp } = await admin
        .from("employees")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();
      employee_id = emp?.id ?? null;
    }

    const admin = createAdminClient();
    await admin.from("error_logs").insert({
      level: body.level ?? "error",
      message: body.message.slice(0, 1000),
      stack: body.stack?.slice(0, 5000) ?? null,
      url: body.url?.slice(0, 500) ?? null,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      user_id: user?.id ?? null,
      employee_id,
      context: body.context ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/log] insert failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
