"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function CkCongTyEditor({
  employeeId,
  month,
  initialCkCongTy,
  action,
}: {
  employeeId: string;
  month: string;
  initialCkCongTy: number;
  action: (fd: FormData) => Promise<void>;
}) {
  const [ckCongTy, setCkCongTy] = useState(initialCkCongTy);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = ckCongTy !== initialCkCongTy;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("employee_id", employeeId);
    fd.set("month", month);
    fd.set("ck_cong_ty", String(ckCongTy));
    try {
      await action(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-block">
      <input
        type="text"
        inputMode="numeric"
        value={fmtInput(ckCongTy)}
        onChange={(e) => setCkCongTy(parseNum(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
        onBlur={save}
        className={cn(
          "h-7 w-36 rounded-md border text-right tabular-nums text-sm font-semibold outline-none transition px-2 pr-7",
          "border-transparent bg-transparent text-neutral-700",
          "hover:bg-neutral-100/80 hover:border-neutral-200",
          "focus:bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100",
          "placeholder:text-neutral-300 placeholder:font-normal",
        )}
        placeholder="0"
      />
      {saving ? (
        <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-neutral-400 pointer-events-none" />
      ) : dirty ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
          title="Lưu (Enter)"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700"
        >
          <Check size={10} />
        </button>
      ) : saved ? (
        <Check size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
      ) : null}
    </div>
  );
}

function fmtInput(n: number): string {
  if (!n) return "";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseNum(s: string): number {
  const digits = s.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}
