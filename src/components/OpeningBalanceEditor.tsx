"use client";

import { useState } from "react";
import { Loader2, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDisplay(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function parseInput(s: string): number | null {
  const normalized = s.replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

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
  const [raw, setRaw] = useState(formatDisplay(initialValue));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const parsed = parseInput(raw);
  const dirty = parsed !== null && parsed !== initialValue;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty || parsed === null) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("employee_id", employeeId);
    fd.set("month", monthStr);
    fd.set("balance", String(parsed));
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
      <div className="flex items-center gap-1">
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className={cn(
              "text-base font-semibold tabular-nums outline-none transition",
              "w-[72px] rounded-lg border px-2 py-0.5 pr-7",
              "border-transparent bg-transparent",
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
              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-md bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700"
            >
              <Check size={11} />
            </button>
          ) : saved ? (
            <span className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Check size={11} />
            </span>
          ) : (
            <Pencil
              size={10}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-300 pointer-events-none"
            />
          )}
        </div>
        <span className="text-base font-semibold tabular-nums text-neutral-700">
          {saved && !dirty ? <span className="text-sm text-emerald-600 font-medium">Đã lưu</span> : "ngày"}
        </span>
      </div>
    </form>
  );
}
