"use client";

import { useState } from "react";
import {
  Wallet,
  Save,
  Loader2,
  Clock,
  Hourglass,
} from "lucide-react";
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

  const isParttime = initialEmploymentType === "parttime";

  const dirty = isParttime
    ? hourlyRate !== initialHourlyRate || overtimeRate !== initialOvertimeRate
    : salary !== initialSalary;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("employment_type", initialEmploymentType);
    fd.set("salary", String(salary));
    fd.set("hourly_rate", String(hourlyRate));
    fd.set("overtime_rate", String(overtimeRate));
    try {
      await action(fd);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {isParttime ? (
        <div className="grid grid-cols-2 gap-2 items-end">
          <Field icon={Clock} label="Lương / giờ (VND)">
            <NumInput value={hourlyRate} onChange={setHourlyRate} dirty={dirty} saving={saving} />
          </Field>
          <Field icon={Hourglass} label="Lương OT / giờ (VND)">
            <NumInput value={overtimeRate} onChange={setOvertimeRate} dirty={dirty} saving={saving} />
          </Field>
        </div>
      ) : (
        <Field icon={Wallet} label="Lương cứng (VND)">
          <NumInput value={salary} onChange={setSalary} dirty={dirty} saving={saving} />
        </Field>
      )}
    </form>
  );
}

function NumInput({
  value,
  onChange,
  dirty,
  saving,
}: {
  value: number;
  onChange: (n: number) => void;
  dirty: boolean;
  saving: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={formatNum(value)}
        onChange={(e) => onChange(parseNum(e.target.value))}
        className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-2.5 pr-10 text-sm outline-none focus:border-neutral-900 tabular-nums"
      />
      <InlineSaveBtn dirty={dirty} saving={saving} />
    </div>
  );
}

function InlineSaveBtn({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  return (
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

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 mb-1 px-0.5 flex items-center gap-1">
        <Icon size={11} className="text-neutral-400" /> {label}
      </span>
      {children}
    </label>
  );
}
