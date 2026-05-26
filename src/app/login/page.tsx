import { headers } from "next/headers";
import LoginForm, { isInAppBrowser } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const inApp = isInAppBrowser(ua);
  const { next = "/" } = await searchParams;

  return (
    <main className="relative min-h-dvh flex items-center justify-center px-safe pt-safe pb-safe overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 h-80 w-80 rounded-full bg-indigo-400/30 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-purple-400/25 blur-3xl animate-float" />
      <LoginForm next={next} defaultInApp={inApp} />
    </main>
  );
}
