"use client";

import { useState, useEffect } from "react";
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
  const [saveError, setSaveError] = useState(false);
  const [focused, setFocused] = useState(false);

  // Sync khi server revalidate trả về giá trị mới từ DB
  useEffect(() => {
    setCkCongTy(initialCkCongTy);
  }, [initialCkCongTy]);

  const dirty = ckCongTy !== initialCkCongTy;

  async function save() {
    if (!dirty) { setFocused(false); return; }
    setSaving(true);
    setSaveError(false);
    const fd = new FormData();
    fd.set("employee_id", employeeId);
    fd.set("month", month);
    fd.set("ck_cong_ty", String(ckCongTy));
    try {
      await action(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
    } finally {
      setSaving(false);
      setFocused(false);
    }
  }

  // Display mode — span để font render y hệt các cột khác (button bị browser override font-size)
  if (!focused) {
    return (
      <span
        onClick={() => setFocused(true)}
        title="Click để chỉnh sửa"
        className={cn(
          "font-semibold tabular-nums text-sm whitespace-nowrap block w-full text-right cursor-text select-none",
          saveError ? "text-red-600" : "text-neutral-700 hover:text-neutral-500",
        )}
      >
        {fmtVnd(ckCongTy)}
        {saving && <Loader2 size={11} className="inline ml-1 animate-spin text-neutral-400" />}
        {!saving && saved && <Check size={11} className="inline ml-1 text-emerald-500" />}
        {!saving && saveError && <span className="ml-1 text-[10px] font-bold">!</span>}
      </span>
    );
  }

  // Edit mode — input xuất hiện khi click
  return (
    <div className="relative inline-block">
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        type="text"
        inputMode="numeric"
        value={fmtInput(ckCongTy)}
        onChange={(e) => { setCkCongTy(parseNum(e.target.value)); setSaveError(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { setCkCongTy(initialCkCongTy); setFocused(false); }
        }}
        onBlur={save}
        className={cn(
          "h-7 w-36 rounded-md border text-right tabular-nums text-sm font-semibold outline-none transition px-2 pr-7",
          saveError
            ? "border-red-400 bg-red-50 text-red-700 focus:border-red-400 focus:ring-1 focus:ring-red-100"
            : "border-transparent bg-white border-indigo-300 ring-1 ring-indigo-100 text-neutral-700",
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
      ) : null}
    </div>
  );
}

function fmtVnd(n: number): string {
  return `${Math.max(0, Math.round(n)).toLocaleString("en-US")} VND`;
}

function fmtInput(n: number): string {
  if (!n) return "";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseNum(s: string): number {
  const digits = s.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}
