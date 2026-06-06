"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function CkCongTyEditor({
  employeeId,
  month,
  initialCkCongTy,
  totalSalary,
  action,
}: {
  employeeId: string;
  month: string;
  initialCkCongTy: number;
  totalSalary: number;
  action: (fd: FormData) => Promise<void>;
}) {
  const [ckCongTy, setCkCongTy] = useState(initialCkCongTy);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = ckCongTy !== initialCkCongTy;
  const ckCaNhan = Math.max(0, totalSalary - ckCongTy);

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
    <div className="flex items-center gap-4 mt-1 flex-wrap">
      {/* CK công ty — editable */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-neutral-400 shrink-0">CK cty</span>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={fmtInput(ckCongTy)}
            onChange={(e) => setCkCongTy(parseNum(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
            onBlur={save}
            className={cn(
              "h-7 w-28 rounded-md border text-right tabular-nums text-xs font-semibold outline-none transition px-2 pr-7",
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
      </div>

      {/* CK cá nhân — readonly, re-computed from state */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-neutral-400 shrink-0">CK cá nhân</span>
        <span className="text-xs font-semibold tabular-nums text-neutral-600 whitespace-nowrap">
          {fmtVnd(ckCaNhan)}
        </span>
      </div>
    </div>
  );
}

function fmtInput(n: number): string {
  if (!n) return "";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtVnd(n: number): string {
  return `${Math.max(0, Math.round(n)).toLocaleString("en-US")} VND`;
}

function parseNum(s: string): number {
  const digits = s.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}
