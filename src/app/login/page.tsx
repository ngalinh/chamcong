"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Fingerprint, Mail, KeyRound, ArrowLeft, CheckCircle2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const dom = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN;
    if (dom && !email.toLowerCase().endsWith("@" + dom.toLowerCase())) {
      setError(`Chỉ email @${dom} mới được đăng ký`);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    // Cố ý KHÔNG đặt emailRedirectTo — email sẽ có cả link + OTP 6 số.
    // Người dùng chỉ cần copy OTP (link sẽ fallback vào Safari nên không dùng được cho PWA).
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) setError(error.message);
    else setStep("otp");
    setLoading(false);
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const clean = token.trim();
    let err = (await supabase.auth.verifyOtp({ email, token: clean, type: "email" })).error;
    if (err) err = (await supabase.auth.verifyOtp({ email, token: clean, type: "magiclink" })).error;

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Link user với employees row + tạo admin nếu cần
    await fetch("/api/auth/bootstrap", { method: "POST" }).catch(() => {});

    router.push(next);
    router.refresh();
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
          <p className="text-sm text-neutral-500 mt-1.5">Đăng nhập bằng email công ty</p>
        </div>
      </div>

      <div className="glass rounded-3xl border border-white/60 shadow-xl shadow-neutral-900/5 p-6">
        {step === "email" ? (
          <form onSubmit={sendOtp} className="flex flex-col gap-3">
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@basso.vn"
                className="w-full h-12 rounded-xl border border-neutral-200 bg-white/80 pl-11 pr-4 text-[15px] outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
              />
            </div>
            {error && <p className="text-xs text-rose-600 px-1">{error}</p>}
            <Button size="lg" disabled={loading}>
              {loading ? "Đang gửi..." : "Gửi mã xác minh"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="flex flex-col gap-3">
            <div className="rounded-2xl bg-emerald-50/80 border border-emerald-100 text-emerald-900 p-3 text-sm flex items-start gap-2 mb-1">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <div>
                Đã gửi mã 6 số tới <b>{email}</b>.<br />
                <span className="text-emerald-700">Mở mail (kể cả spam) → copy mã vào ô dưới.</span>
              </div>
            </div>
            <div className="relative">
              <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                ref={otpRef}
                required
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\s/g, ""))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="w-full h-12 rounded-xl border border-neutral-200 bg-white/80 pl-11 pr-4 text-lg outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5 tracking-[0.4em] text-center font-mono"
              />
            </div>
            {error && <p className="text-xs text-rose-600 px-1">{error}</p>}
            <Button size="lg" disabled={loading || token.length < 6}>
              {loading ? "Đang xác minh..." : "Đăng nhập"}
            </Button>
            <button
              type="button"
              onClick={() => { setStep("email"); setToken(""); setError(null); }}
              className="text-xs text-neutral-500 mt-1 flex items-center gap-1 self-center hover:text-neutral-900"
            >
              <ArrowLeft size={12} /> Đổi email
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-neutral-400 mt-6">
        Chỉ email công ty. Không cần password.
      </p>
    </div>
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
