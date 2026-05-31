"use client";

import { useState } from "react";
import { Loader2, Check, Pencil } from "lucide-react";
import type { EmploymentType } from "@/types/db";
import { cn } from "@/lib/utils";

export default function EmployeePayrollEditor({
  employeeId,
  initialEmploymentType,
  initialSalary,
  initialHourlyRate,
  initialOvertimeRate,
  action,
}: {
  employeeId: string;
  initialEmploymentType: EmploymentType;
  initialSalary: number;
  initialHourlyRate: number;
  initialOvertimeRate: number;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [salary, setSalary] = useState(initialSalary);
  const [hourlyRate, setHourlyRate] = useState(initialHourlyRate);
  const [overtimeRate, setOvertimeRate] = useState(initialOvertimeRate);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isParttime = initialEmploymentType === "parttime";

  const dirty = isParttime
    ? hourlyRate !== initialHourlyRate || overtimeRate !== initialOvertimeRate
    : salary !== initialSalary;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("employment_type", initialEmploymentType);
    fd.set("salary", String(salary));
    fd.set("hourly_rate", String(hourlyRate));
    fd.set("overtime_rate", String(overtimeRate));
    try {
      await action(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      {isParttime ? (
        <>
          <PayRow
            label="Giờ"
            value={hourlyRate}
            onChange={setHourlyRate}
            unit="VND/giờ"
            dirty={dirty}
            saving={saving}
            saved={saved}
          />
          <PayRow
            label="OT"
            value={overtimeRate}
            onChange={setOvertimeRate}
            unit="VND/giờ"
            dirty={dirty}
            saving={saving}
            saved={saved}
          />
        </>
      ) : (
        <PayRow
          label="Cứng"
          value={salary}
          onChange={setSalary}
          unit="VND"
          dirty={dirty}
          saving={saving}
          saved={saved}
        />
      )}
    </form>
  );
}

function PayRow({
  label,
  value,
  onChange,
  unit,
  dirty,
  saving,
  saved,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit: string;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 w-8 shrink-0">
        {label}
      </span>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={formatNum(value)}
          onChange={(e) => onChange(parseNum(e.target.value))}
          placeholder="chưa set"
          className={cn(
            "h-[34px] w-[128px] rounded-lg border text-right tabular-nums text-[13px] font-semibold outline-none transition px-2.5 pr-8",
            "border-transparent bg-transparent text-neutral-800",
            "hover:bg-neutral-100 hover:border-neutral-100",
            "focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100",
            "placeholder:text-neutral-300 placeholder:font-normal",
          )}
        />
        <SaveIndicator dirty={dirty} saving={saving} saved={saved} />
      </div>
      <span className="text-[10px] text-neutral-400 min-w-[38px]">
        {saved && !dirty ? <span className="text-emerald-600 font-semibold">Đã lưu</span> : unit}
      </span>
    </div>
  );
}

function SaveIndicator({
  dirty,
  saving,
  saved,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
}) {
  if (saving) {
    return (
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400">
        <Loader2 size={13} className="animate-spin" />
      </span>
    );
  }
  if (dirty) {
    return (
      <button
        type="submit"
        title="Lưu (Enter)"
        onMouseDown={(e) => e.preventDefault()}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700"
      >
        <Check size={12} />
      </button>
    );
  }
  if (saved) {
    return (
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
        <Check size={12} />
      </span>
    );
  }
  return (
    <Pencil
      size={11}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-300 opacity-0 group-hover:opacity-100 pointer-events-none"
    />
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
