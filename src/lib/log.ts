/**
 * Client-side error logger — POST tới /api/log để ghi vào Supabase.
 * Không throw, không await trong caller (fire-and-forget).
 *
 * Dùng:
 *   import { logError } from "@/lib/log";
 *   try { ... } catch (e) { logError(e, { where: "CheckInFlow.run" }); throw e; }
 */
type LogLevel = "error" | "warn" | "info";

export function logError(
  err: unknown,
  context?: Record<string, unknown>,
  level: LogLevel = "error",
) {
  try {
    const message =
      err instanceof Error ? err.message :
      typeof err === "string" ? err :
      JSON.stringify(err);
    const stack = err instanceof Error ? err.stack : undefined;

    if (typeof window === "undefined") return;

    // Bỏ qua React error #418/#419/#421/#422/#423/#425 — đều là cảnh báo
    // hydration / Suspense fail trên mạng yếu, React tự fallback client-render.
    // Không phải bug app, log vào noisy không có giá trị.
    if (/Minified React error #(418|419|421|422|423|425)\b/.test(message)) return;

    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level,
        message,
        stack,
        url: window.location.href,
        context,
      }),
      keepalive: true,
    }).catch(() => {});

    if (level === "error") console.error("[logError]", err, context);
    else if (level === "warn") console.warn("[logError]", err, context);
  } catch {
    // never throw
  }
}

/**
 * Đăng ký global error / unhandledrejection listener — gọi 1 lần ở client root.
 */
export function installGlobalErrorLogger() {
  if (typeof window === "undefined") return;
  // @ts-expect-error custom marker
  if (window.__logger_installed__) return;
  // @ts-expect-error custom marker
  window.__logger_installed__ = true;

  window.addEventListener("error", (ev) => {
    logError(ev.error ?? ev.message, {
      where: "window.error",
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    logError(ev.reason, { where: "window.unhandledrejection" });
  });
}
