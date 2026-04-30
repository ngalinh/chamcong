"use client";

import { useState } from "react";
import { Clock, Save, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmployeeWorkHoursEditor({
  employeeId,
  initialStart,
  initialEnd,
  officeStart,
  officeEnd,
  action,
}: {
  employeeId: string;
  initialStart: string | null;
  initialEnd: string | null;
  officeStart: string | null;
  officeEnd: string | null;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const initialStartHM = initialStart?.slice(0, 5) ?? "";
  const initialEndHM = initialEnd?.slice(0, 5) ?? "";

  const [expanded, setExpanded] = useState(false);
  const [start, setStart] = useState(initialStartHM);
  const [end, setEnd] = useState(initialEndHM);
  const [saving, setSaving] = useState(false);

  const dirty = start !== initialStartHM || end !== initialEndHM;
  const officeStartHM = officeStart?.slice(0, 5);
  const officeEndHM = officeEnd?.slice(0, 5);
  const hasOverride = !!initialStart || !!initialEnd;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("work_start_time", start.trim());
    fd.set("work_end_time", end.trim());
    try {
      await action(fd);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setStart(initialStartHM);
    setEnd(initialEndHM);
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition",
          hasOverride
            ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
        )}
        title={hasOverride ? "Click để sửa giờ làm riêng" : "Click để set giờ làm riêng (mặc định = giờ chi nhánh)"}
      >
        <Clock size={12} />
        {hasOverride
          ? `Giờ làm riêng: ${initialStartHM || officeStartHM || "—"} → ${initialEndHM || officeEndHM || "—"}`
          : "Thời gian làm việc"}
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-neutral-200 bg-white p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
          Giờ làm riêng — để trống = dùng giờ chi nhánh
          {officeStartHM && officeEndHM && (
            <span className="text-neutral-400 ml-1 normal-case tracking-normal">
              ({officeStartHM}–{officeEndHM})
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={close}
          aria-label="Đóng"
          className="h-6 w-6 rounded text-neutral-400 hover:bg-neutral-100 flex items-center justify-center"
        >
          <X size={12} />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-center">
        <input
          type="time"
          value={start}
          step={300}
          onChange={(e) => setStart(e.target.value)}
          placeholder={officeStartHM ?? "—"}
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
        />
        <span className="text-neutral-400">→</span>
        <input
          type="time"
          value={end}
          step={300}
          onChange={(e) => setEnd(e.target.value)}
          placeholder={officeEndHM ?? "—"}
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
        />
        <button
          type="button"
          onClick={() => { setStart(""); setEnd(""); }}
          title="Xoá override → dùng giờ chi nhánh"
          className="h-9 w-9 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 flex items-center justify-center"
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm font-medium hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Lưu
        </button>
      </div>
    </form>
  );
}
