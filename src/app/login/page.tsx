"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Fingerprint, Mail, KeyRound, ArrowLeft } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"email" | "otp">("email");
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  async function sendLink(e: React.FormEvent) {
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
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setError(error.message);
    else setSent(true);
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
    router.push(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo with soft ring */}
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="relative">
          <div className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-indigo-400/40 to-purple-400/40 blur-2xl" />
          <div className="relative h-20 w-20 rounded-[24px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 shadow-xl shadow-indigo-500/40 flex items-center justify-center ring-1 ring-white/60">
            <Fingerprint size={34} className="text-white" strokeWidth={1.8} />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Chấm công</h1>
          <p className="text-sm text-neutral-500 mt-1.5">Nhận diện khuôn mặt + định vị</p>
        </div>
      </div>

      <div className="glass rounded-3xl border border-white/60 shadow-xl shadow-neutral-900/5 p-6">
        {mode === "otp" ? (
          <form onSubmit={verifyOtp} className="flex flex-col gap-3">
            <Field icon={Mail} type="email" value={email} onChange={setEmail} placeholder="Email" required autoFocus />
            <Field icon={KeyRound} value={token} onChange={setToken} placeholder="Mã 6 số" required className="tracking-[0.3em] text-center font-mono" inputMode="numeric" />
            {error && <ErrorText msg={error} />}
            <Button size="lg" disabled={loading}>
              {loading ? "Đang xác minh..." : "Xác minh"}
            </Button>
            <button type="button" onClick={() => setMode("email")} className="text-xs text-neutral-500 mt-2 flex items-center gap-1 self-center hover:text-neutral-900">
              <ArrowLeft size={12} /> Quay lại đăng nhập bằng link
            </button>
          </form>
        ) : sent ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-indigo-50/80 text-indigo-950 p-4 text-sm leading-relaxed border border-indigo-100">
              Đã gửi email tới <b>{email}</b>. Mở mail (kể cả <b>spam</b>), click link hoặc copy mã 6 số bên dưới.
            </div>
            <Button variant="secondary" size="lg" onClick={() => setMode("otp")}>
              Tôi có mã 6 số
            </Button>
          </div>
        ) : (
          <form onSubmit={sendLink} className="flex flex-col gap-3">
            <Field icon={Mail} type="email" value={email} onChange={setEmail} placeholder="ban@basso.vn" required autoFocus />
            {error && <ErrorText msg={error} />}
            <Button size="lg" disabled={loading}>
              {loading ? "Đang gửi..." : "Gửi link đăng nhập"}
            </Button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-neutral-400 mt-6">
        Chỉ email công ty. Không lưu password.
      </p>
    </div>
  );
}

function Field({
  icon: Icon,
  value,
  onChange,
  className = "",
  ...rest
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string;
  onChange: (v: string) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  return (
    <div className="relative">
      <Icon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-12 rounded-xl border border-neutral-200 bg-white/80 pl-11 pr-4 text-[15px] outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5 ${className}`}
        {...rest}
      />
    </div>
  );
}

function ErrorText({ msg }: { msg: string }) {
  return <p className="text-xs text-rose-600 px-1">{msg}</p>;
}

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh flex items-center justify-center px-safe pt-safe pb-safe overflow-hidden">
      {/* Ambient decorative blobs */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-80 w-80 rounded-full bg-indigo-400/30 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-purple-400/25 blur-3xl animate-float" />
      <Suspense fallback={<div className="text-neutral-500 text-sm">Đang tải...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
