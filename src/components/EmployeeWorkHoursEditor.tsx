"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Save, Loader2, RotateCcw, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkShift } from "@/types/db";
import { TimeInput } from "@/components/ui/TimeInput";

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

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shifts, setShifts] = useState<WorkShift[]>(
    initialEffective.length > 0
      ? initialEffective
      : [{ start: officeStart ?? "09:00:00", end: officeEnd ?? "18:00:00" }],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const dirty = JSON.stringify(shifts.map(toHM)) !== JSON.stringify(initialEffective.map(toHM));
  const officeStartHM = officeStart?.slice(0, 5);
  const officeEndHM = officeEnd?.slice(0, 5);
  const hasOverride = initialEffective.length > 0;
  const isMulti = initialEffective.length > 1;

  // Tooltip text for the trigger button
  const title = !hasOverride
    ? "Thời gian làm việc"
    : isMulti
      ? `${initialEffective.length} ca riêng`
      : `Giờ riêng: ${initialEffective[0].start.slice(0, 5)} → ${initialEffective[0].end.slice(0, 5)}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("work_shifts", JSON.stringify(shifts));
    try {
      await action(fd);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setShifts(
      initialEffective.length > 0
        ? initialEffective
        : [{ start: officeStart ?? "09:00:00", end: officeEnd ?? "18:00:00" }],
    );
    setOpen(false);
  }

  function clearAll() {
    setShifts([]);
  }

  function addShift() {
    setShifts((prev) => [
      ...prev,
      { start: officeStart ?? "09:00:00", end: officeEnd ?? "18:00:00" },
    ]);
  }

  function removeShift(idx: number) {
    setShifts((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateShift(idx: number, patch: Partial<WorkShift>) {
    setShifts((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title}
        className={cn(
          "h-8 w-8 rounded-lg border flex items-center justify-center transition",
          hasOverride
            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
        )}
      >
        <Clock size={14} />
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !saving && close()}
        >
          <form
            onSubmit={onSubmit}
            className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-neutral-100">
              <div>
                <h3 className="font-semibold text-sm">Thời gian làm việc</h3>
                {officeStartHM && officeEndHM && (
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Giờ chi nhánh: {officeStartHM} → {officeEndHM}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="h-8 w-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-2">
              <p className="text-[11px] text-neutral-500 mb-3">
                Để trống = dùng giờ chi nhánh. Có thể thêm nhiều ca.
              </p>

              {shifts.length === 0 ? (
                <div className="text-xs text-neutral-500 text-center py-3 rounded-lg border border-dashed border-neutral-200">
                  Đã xoá hết — sẽ dùng giờ chi nhánh sau khi lưu.
                </div>
              ) : (
                <div className="space-y-2">
                  {shifts.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 shrink-0 w-9">
                        Ca {i + 1}
                      </span>
                      <TimeInput
                        value={s.start.slice(0, 5)}
                        onChange={(v) => updateShift(i, { start: v })}
                        className="h-9 flex-1 min-w-0 rounded-lg border border-neutral-200 bg-white px-2 text-sm outline-none focus:border-neutral-900 tabular-nums"
                      />
                      <span className="text-neutral-400 shrink-0 text-xs">→</span>
                      <TimeInput
                        value={s.end.slice(0, 5)}
                        onChange={(v) => updateShift(i, { end: v })}
                        className="h-9 flex-1 min-w-0 rounded-lg border border-neutral-200 bg-white px-2 text-sm outline-none focus:border-neutral-900 tabular-nums"
                      />
                      {shifts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeShift(i)}
                          className="h-9 w-9 shrink-0 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-rose-300 hover:text-rose-600 flex items-center justify-center"
                        >
                          <X size={13} />
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
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={clearAll}
                title="Xoá hết → dùng giờ chi nhánh"
                className="h-9 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-600 text-xs hover:bg-neutral-50 inline-flex items-center gap-1.5"
              >
                <RotateCcw size={12} /> Xoá hết
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={!dirty || saving}
                className="h-9 px-4 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Lưu
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

function toHM(s: WorkShift): { start: string; end: string } {
  return { start: s.start.slice(0, 5), end: s.end.slice(0, 5) };
}
