"use client";

import { useState } from "react";
import { Clock, Save, Loader2, RotateCcw, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkShift } from "@/types/db";

export default function EmployeeWorkHoursEditor({
  employeeId,
  initialShifts,
  initialStart,
  initialEnd,
  officeStart,
  officeEnd,
  action,
}: {
  employeeId: string;
  initialShifts: WorkShift[];
  initialStart: string | null;
  initialEnd: string | null;
  officeStart: string | null;
  officeEnd: string | null;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const initialEffective: WorkShift[] = initialShifts.length > 0
    ? initialShifts
    : initialStart && initialEnd
      ? [{ start: initialStart, end: initialEnd }]
      : [];

  const [expanded, setExpanded] = useState(false);
  const [shifts, setShifts] = useState<WorkShift[]>(initialEffective.length > 0 ? initialEffective : [{ start: officeStart ?? "09:00:00", end: officeEnd ?? "18:00:00" }]);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(shifts.map(toHM)) !== JSON.stringify(initialEffective.map(toHM));
  const officeStartHM = officeStart?.slice(0, 5);
  const officeEndHM = officeEnd?.slice(0, 5);
  const hasOverride = initialEffective.length > 0;
  const isMulti = initialEffective.length > 1;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    // Server normalize HH:MM → HH:MM:SS
    fd.set("work_shifts", JSON.stringify(shifts));
    try {
      await action(fd);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setShifts(initialEffective.length > 0 ? initialEffective : [{ start: officeStart ?? "09:00:00", end: officeEnd ?? "18:00:00" }]);
    setExpanded(false);
  }

  function clearAll() {
    setShifts([]);
  }

  function addShift() {
    setShifts((prev) => [...prev, { start: officeStart ?? "09:00:00", end: officeEnd ?? "18:00:00" }]);
  }

  function removeShift(idx: number) {
    setShifts((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateShift(idx: number, patch: Partial<WorkShift>) {
    setShifts((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  if (!expanded) {
    let label: string;
    if (!hasOverride) label = "Thời gian làm việc";
    else if (isMulti) label = `${initialEffective.length} ca riêng`;
    else label = `Giờ làm riêng: ${initialEffective[0].start.slice(0, 5)} → ${initialEffective[0].end.slice(0, 5)}`;
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
      >
        <Clock size={12} />
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2">
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

      {shifts.length === 0 ? (
        <div className="text-xs text-neutral-500 text-center py-3">
          Đã xoá hết — sẽ dùng giờ chi nhánh sau khi lưu.
        </div>
      ) : (
        <div className="space-y-2">
          {shifts.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 shrink-0 w-10">
                Ca {i + 1}
              </span>
              <input
                type="time"
                value={s.start.slice(0, 5)}
                step={300}
                onChange={(e) => updateShift(i, { start: e.target.value })}
                className="h-9 flex-1 min-w-0 rounded-lg border border-neutral-200 bg-white px-2 text-sm outline-none focus:border-neutral-900 tabular-nums"
              />
              <span className="text-neutral-400 shrink-0">→</span>
              <input
                type="time"
                value={s.end.slice(0, 5)}
                step={300}
                onChange={(e) => updateShift(i, { end: e.target.value })}
                className="h-9 flex-1 min-w-0 rounded-lg border border-neutral-200 bg-white px-2 text-sm outline-none focus:border-neutral-900 tabular-nums"
              />
              {shifts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeShift(i)}
                  aria-label="Xoá ca"
                  className="h-9 w-9 shrink-0 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-rose-300 hover:text-rose-600 flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addShift}
        className="h-8 w-full rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 flex items-center justify-center gap-1.5"
      >
        <Plus size={12} /> Thêm ca
      </button>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={clearAll}
          title="Xoá hết → dùng giờ chi nhánh"
          className="h-9 px-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-500 text-xs hover:bg-neutral-50 inline-flex items-center gap-1"
        >
          <RotateCcw size={12} /> Xoá hết
        </button>
        <div className="flex-1" />
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

function toHM(s: WorkShift): { start: string; end: string } {
  return { start: s.start.slice(0, 5), end: s.end.slice(0, 5) };
}
