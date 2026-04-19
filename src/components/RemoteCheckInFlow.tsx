"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wifi, X, CheckCircle2, XCircle, Loader2, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "idle" | "uploading" | "done" | "error";

export default function RemoteCheckInFlow({
  employeeName,
  officeId,
  officeName,
}: {
  employeeName: string;
  officeId: string;
  officeName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<string | null>(null);

  async function run() {
    setError(null);
    setStep("uploading");
    try {
      const form = new FormData();
      form.append("office_id", officeId);
      const res = await fetch("/api/checkin", { method: "POST", body: form });
      const data: { ok?: boolean; error?: string; kind?: "in" | "out"; late_minutes?: number; early_minutes?: number } =
        await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Server từ chối");
      const label = data.kind === "out" ? "Check-out" : "Check-in";
      let extra = "";
      if (data.kind === "in" && data.late_minutes) extra = ` · muộn ${data.late_minutes}p`;
      if (data.kind === "out" && data.early_minutes) extra = ` · về sớm ${data.early_minutes}p`;
      setResultLabel(`${label} thành công${extra}`);
      setStep("done");
      setTimeout(() => router.push("/"), 1800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  return (
    <main className="relative min-h-dvh bg-neutral-950 text-white overflow-hidden flex flex-col">
      <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-indigo-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />

      <div className="relative pt-safe px-safe">
        <div className="flex items-center justify-between py-3">
          <Link href="/" className="h-10 w-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
            <X size={20} />
          </Link>
          <p className="text-sm font-medium">{employeeName}</p>
          <div className="w-10" />
        </div>
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 gap-8">
        <div className="h-32 w-32 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/30 flex items-center justify-center">
          <Wifi size={56} strokeWidth={1.5} className="text-white" />
        </div>

        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-white/60 mb-1.5">{officeName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Chấm công online</h1>
          <p className="text-sm text-white/70 mt-2 max-w-xs">
            Không cần selfie hay vị trí. Hệ thống tự ghi nhận thời điểm bạn chạm nút.
          </p>
        </div>

        <StatusPill step={step} />

        {error && (
          <div className="w-full max-w-sm rounded-2xl bg-rose-500/15 backdrop-blur border border-rose-400/30 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}
        {resultLabel && step === "done" && (
          <div className="w-full max-w-sm rounded-2xl bg-emerald-500/15 backdrop-blur border border-emerald-400/30 p-4 text-sm text-emerald-100 text-center">
            {resultLabel}
          </div>
        )}
      </div>

      <div className="relative pb-safe px-safe pt-4">
        <div className="mx-auto max-w-md">
          {step === "idle" || step === "error" ? (
            <button
              onClick={run}
              className="w-full h-16 rounded-2xl bg-white text-neutral-900 font-semibold text-lg shadow-2xl active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <LogIn size={20} /> {step === "error" ? "Thử lại" : "Bấm để chấm công"}
            </button>
          ) : step === "done" ? (
            <button
              onClick={() => router.push("/")}
              className="w-full h-16 rounded-2xl bg-white/15 backdrop-blur border border-white/30 text-white font-semibold flex items-center justify-center gap-2"
            >
              <LogOut size={20} /> Về trang chủ
            </button>
          ) : (
            <div className="h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center gap-2 text-white/80">
              <Loader2 size={18} className="animate-spin" /> Đang gửi...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatusPill({ step }: { step: Step }) {
  if (step === "idle") return null;
  const map = {
    uploading: { Icon: Loader2,      cls: "bg-white/15 text-white",    label: "Đang xử lý..."    , spin: true },
    done:      { Icon: CheckCircle2, cls: "bg-emerald-500 text-white", label: "Đã ghi nhận",       spin: false },
    error:     { Icon: XCircle,      cls: "bg-rose-500 text-white",    label: "Có lỗi xảy ra",     spin: false },
  } as const;
  const m = map[step as keyof typeof map];
  return (
    <div className={cn("rounded-full backdrop-blur px-4 py-2 flex items-center gap-2 text-sm font-medium shadow-lg", m.cls)}>
      <m.Icon size={16} className={m.spin ? "animate-spin" : ""} />
      {m.label}
    </div>
  );
}
