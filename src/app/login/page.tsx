"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Fingerprint, Loader2, AlertTriangle, Copy, Check } from "lucide-react";

/**
 * Detect in-app webview (Facebook, Messenger, Instagram, Zalo, TikTok, Line…).
 * Google chặn OAuth từ những browser này từ 2021 — báo lỗi
 * disallowed_useragent. NV phải mở link trong Safari / Chrome thật.
 */
function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|FBSS|Instagram|Line\/|Twitter|MicroMessenger|TikTok|Zalo|KAKAOTALK|NAVER|SnapChat/i.test(ua);
}

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inApp, setInApp] = useState(false);
  const [copied, setCopied] = useState(false);
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  useEffect(() => {
    setInApp(isInAppBrowser(navigator.userAgent ?? ""));
  }, []);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="relative">
          <div className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-indigo-400/40 to-purple-400/40 blur-2xl" />
          <div className="relative h-20 w-20 rounded-[24px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 shadow-xl shadow-indigo-500/40 flex items-center justify-center ring-1 ring-white/60">
            <Fingerprint size={34} className="text-white" strokeWidth={1.8} />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Chấm công</h1>
          <p className="text-sm text-neutral-500 mt-1.5">Đăng nhập để tiếp tục</p>
        </div>
      </div>

      {inApp && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">Bạn đang mở trong app khác (Facebook/Messenger/Zalo…)</p>
              <p className="text-xs mt-1 text-amber-800">
                Google không cho phép đăng nhập từ in-app browser. Hãy mở link này trong <b>Safari</b> (iOS)
                hoặc <b>Chrome</b> (Android).
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-white/80 p-2.5 text-xs text-neutral-700 space-y-1.5">
            <p className="font-medium">Cách mở:</p>
            <p>📱 <b>iOS:</b> bấm <b>•••</b> góc trên phải → <b>Open in Safari</b></p>
            <p>🤖 <b>Android:</b> bấm menu <b>⋮</b> → <b>Open in Chrome</b></p>
          </div>
          <button
            onClick={copyUrl}
            className="w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium flex items-center justify-center gap-2 transition"
          >
            {copied ? <><Check size={16} /> Đã copy</> : <><Copy size={16} /> Copy link để paste vào Safari</>}
          </button>
        </div>
      )}

      <div className="glass rounded-3xl border border-white/60 shadow-xl shadow-neutral-900/5 p-6">
        <button
          onClick={signInWithGoogle}
          disabled={loading || inApp}
          className="w-full h-12 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition text-[15px] font-medium flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={18} className="animate-spin text-neutral-500" /> : <GoogleIcon />}
          <span>{loading ? "Đang chuyển..." : "Tiếp tục với Google"}</span>
        </button>
        {error && <p className="text-xs text-rose-600 px-1 mt-3">{error}</p>}
      </div>

      <p className="text-center text-xs text-neutral-400 mt-6">
        Chỉ tài khoản Google đã được cấp quyền mới đăng nhập được.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh flex items-center justify-center px-safe pt-safe pb-safe overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 h-80 w-80 rounded-full bg-indigo-400/30 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-purple-400/25 blur-3xl animate-float" />
      <Suspense fallback={<div className="text-neutral-500 text-sm">Đang tải...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
