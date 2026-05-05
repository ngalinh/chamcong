import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side error logger — insert vào error_logs.
 * Fire-and-forget; không throw nếu log fail.
 *
 * Dùng trong server actions / API routes:
 *   try { ... } catch (e) { logServerError(e, { where: "decideLeave" }); throw e; }
 */
export function logServerError(
  err: unknown,
  context?: Record<string, unknown> & { user_id?: string; employee_id?: string },
  level: "error" | "warn" | "info" = "error",
) {
  try {
    const message =
      err instanceof Error ? err.message :
      typeof err === "string" ? err :
      JSON.stringify(err);
    const stack = err instanceof Error ? err.stack : undefined;

    const { user_id, employee_id, ...rest } = context ?? {};

    const admin = createAdminClient();
    admin
      .from("error_logs")
      .insert({
        level,
        message: message.slice(0, 1000),
        stack: stack?.slice(0, 5000) ?? null,
        user_id: user_id ?? null,
        employee_id: employee_id ?? null,
        context: Object.keys(rest).length ? rest : null,
      })
      .then(({ error }) => {
        if (error) console.error("[logServerError] insert failed", error);
      });
  } catch (e) {
    console.error("[logServerError] threw", e);
  }
}
