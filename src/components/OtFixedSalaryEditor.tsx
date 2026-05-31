"use client";

import { useState } from "react";
import { Loader2, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OtFixedSalaryEditor({
  employeeId,
  initialValue,
  action,
}: {
  employeeId: string;
  initialValue: number | null;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initialValue ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = value !== (initialValue ?? 0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("ot_fixed_salary", String(value));
    try {
      await action(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 w-8 shrink-0">
          OT
        </span>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={formatNum(value)}
            onChange={(e) => setValue(parseNum(e.target.value))}
            placeholder="chưa set"
            className={cn(
              "h-[34px] w-[128px] rounded-lg border text-right tabular-nums text-[13px] font-semibold outline-none transition px-2.5 pr-8",
              "border-transparent bg-transparent text-neutral-800",
              "hover:bg-neutral-100 hover:border-neutral-100",
              "focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100",
              "placeholder:text-neutral-300 placeholder:font-normal",
            )}
          />
          {saving ? (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400">
              <Loader2 size={13} className="animate-spin" />
            </span>
          ) : dirty ? (
            <button
              type="submit"
              title="Lưu (Enter)"
              onMouseDown={(e) => e.preventDefault()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700"
            >
              <Check size={12} />
            </button>
          ) : saved ? (
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Check size={12} />
            </span>
          ) : (
            <Pencil
              size={11}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-300 pointer-events-none"
            />
          )}
        </div>
        <span className="text-[10px] text-neutral-400 min-w-[38px]">
          {saved && !dirty ? (
            <span className="text-emerald-600 font-semibold">Đã lưu</span>
          ) : (
            "VND"
          )}
        </span>
      </div>
    </form>
  );
}

function formatNum(n: number): string {
  if (!n) return "";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function parseNum(s: string): number {
  const digits = s.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}
