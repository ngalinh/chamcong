"use client";

import { useState } from "react";
import { Loader2, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OpeningBalanceEditor({
  employeeId,
  monthStr,
  initialValue,
  action,
}: {
  employeeId: string;
  monthStr: string;
  initialValue: number;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = value !== initialValue;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("employee_id", employeeId);
    fd.set("month", monthStr);
    fd.set("balance", String(value));
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
        <div className="relative">
          <input
            type="number"
            step="0.25"
            min="0"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className={cn(
              "h-[34px] w-[96px] rounded-lg border text-right tabular-nums text-[13px] font-semibold outline-none transition px-2.5 pr-8",
              "border-transparent bg-transparent text-neutral-800",
              "hover:bg-neutral-100 hover:border-neutral-100",
              "focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100",
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
        <span className="text-[10px] text-neutral-400">
          {saved && !dirty ? (
            <span className="text-emerald-600 font-semibold">Đã lưu</span>
          ) : (
            "ngày"
          )}
        </span>
      </div>
    </form>
  );
}
