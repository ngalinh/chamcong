"use client";

import { useState } from "react";
import { Clock, Save, X, Loader2 } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue ?? 0);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("ot_fixed_salary", String(value));
    try {
      await action(fd);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 px-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 inline-flex items-center gap-1.5 text-neutral-700"
      >
        <Clock size={12} className="text-neutral-400" />
        Lương ngoài giờ
        {initialValue ? (
          <span className="text-indigo-600 font-semibold">{formatNum(initialValue)}đ</span>
        ) : (
          <span className="text-neutral-400">chưa set</span>
        )}
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="inline-flex items-center gap-1.5">
      <div className="relative">
        <Clock size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          inputMode="numeric"
          value={formatNum(value)}
          onChange={(e) => setValue(parseNum(e.target.value))}
          autoFocus
          placeholder="0"
          className="h-8 w-40 rounded-lg border border-neutral-200 bg-white pl-6 pr-2 text-sm outline-none focus:border-indigo-500 tabular-nums"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className={cn(
          "h-8 w-8 rounded-lg inline-flex items-center justify-center transition",
          saving ? "text-neutral-300" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100",
        )}
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
      </button>
      <button
        type="button"
        onClick={() => { setValue(initialValue ?? 0); setOpen(false); }}
        className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-neutral-400 hover:bg-neutral-100"
      >
        <X size={13} />
      </button>
      <span className="text-xs text-neutral-400">đ/tháng</span>
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
