"use client";

import { useState } from "react";
import { Clock, Save, Loader2, RotateCcw } from "lucide-react";

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
  // null = dùng giờ chi nhánh (không override). Khi sửa thành "" trong form
  // → coi là dùng default. Display thì show giờ thật (override hoặc office).
  const [start, setStart] = useState(initialStart?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(initialEnd?.slice(0, 5) ?? "");
  const [saving, setSaving] = useState(false);

  const initialStartHM = initialStart?.slice(0, 5) ?? "";
  const initialEndHM = initialEnd?.slice(0, 5) ?? "";
  const dirty = start !== initialStartHM || end !== initialEndHM;

  const officeStartHM = officeStart?.slice(0, 5);
  const officeEndHM = officeEnd?.slice(0, 5);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("work_start_time", start.trim());
    fd.set("work_end_time", end.trim());
    try {
      await action(fd);
    } finally {
      setSaving(false);
    }
  }

  function clearAll() {
    setStart("");
    setEnd("");
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-end">
      <Field label="Giờ bắt đầu">
        <input
          type="time"
          value={start}
          step={300}
          onChange={(e) => setStart(e.target.value)}
          placeholder={officeStartHM ?? "—"}
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
        />
      </Field>
      <span className="text-neutral-400 pb-1.5">→</span>
      <Field label="Giờ kết thúc">
        <input
          type="time"
          value={end}
          step={300}
          onChange={(e) => setEnd(e.target.value)}
          placeholder={officeEndHM ?? "—"}
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
        />
      </Field>
      <button
        type="button"
        onClick={clearAll}
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
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 mb-1 px-0.5 flex items-center gap-1">
        <Clock size={11} className="text-neutral-400" /> {label}
      </span>
      {children}
    </label>
  );
}
