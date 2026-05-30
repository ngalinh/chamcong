"use client";

import { useState } from "react";
import { Clock, Save, Loader2 } from "lucide-react";
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
  const dirty = value !== (initialValue ?? 0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("ot_fixed_salary", String(value));
    try {
      await action(fd);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-56 max-w-full">
      <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 mb-1 px-0.5 flex items-center gap-1">
        <Clock size={11} className="text-neutral-400" /> Lương ngoài giờ (VND)
      </span>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={formatNum(value)}
          onChange={(e) => setValue(parseNum(e.target.value))}
          placeholder="chưa set"
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-2.5 pr-10 text-sm outline-none focus:border-neutral-900 tabular-nums"
        />
        <button
          type="submit"
          disabled={!dirty || saving}
          title="Lưu"
          aria-label="Lưu"
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md inline-flex items-center justify-center transition",
            dirty && !saving
              ? "text-indigo-600 hover:bg-indigo-50"
              : "text-neutral-300 cursor-not-allowed",
          )}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        </button>
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
