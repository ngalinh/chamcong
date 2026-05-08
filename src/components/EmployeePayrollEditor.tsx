"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Wallet,
  CalendarOff,
  Save,
  Loader2,
  ExternalLink,
  Briefcase,
  Clock,
  Hourglass,
} from "lucide-react";
import type { EmploymentType } from "@/types/db";
import { cn } from "@/lib/utils";

export default function EmployeePayrollEditor({
  employeeId,
  initialEmploymentType,
  initialSalary,
  initialLeaveBalance,
  initialHourlyRate,
  initialOvertimeRate,
  action,
}: {
  employeeId: string;
  initialEmploymentType: EmploymentType;
  initialSalary: number;
  initialLeaveBalance: number;
  initialHourlyRate: number;
  initialOvertimeRate: number;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [employmentType, setEmploymentType] = useState<EmploymentType>(initialEmploymentType);
  const [salary, setSalary] = useState(initialSalary);
  const [balance, setBalance] = useState(initialLeaveBalance);
  const [hourlyRate, setHourlyRate] = useState(initialHourlyRate);
  const [overtimeRate, setOvertimeRate] = useState(initialOvertimeRate);
  const [saving, setSaving] = useState(false);

  const dirty =
    employmentType !== initialEmploymentType ||
    salary !== initialSalary ||
    balance !== initialLeaveBalance ||
    hourlyRate !== initialHourlyRate ||
    overtimeRate !== initialOvertimeRate;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("employment_type", employmentType);
    fd.set("salary", String(salary));
    fd.set("leave_balance", String(balance));
    fd.set("hourly_rate", String(hourlyRate));
    fd.set("overtime_rate", String(overtimeRate));
    try {
      await action(fd);
    } finally {
      setSaving(false);
    }
  }

  const isParttime = employmentType === "parttime";

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {/* Employment type toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium px-0.5 flex items-center gap-1">
          <Briefcase size={11} className="text-neutral-400" /> Loại
        </span>
        <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 gap-0.5">
          <TypeBtn
            active={!isParttime}
            onClick={() => setEmploymentType("fulltime")}
            label="Fulltime"
          />
          <TypeBtn
            active={isParttime}
            onClick={() => setEmploymentType("parttime")}
            label="Parttime"
          />
        </div>
      </div>

      {/* Fields theo loại */}
      {isParttime ? (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
          <Field icon={Clock} label="Lương / giờ (VND)">
            <NumInput value={hourlyRate} onChange={setHourlyRate} />
          </Field>
          <Field icon={Hourglass} label="Lương OT / giờ (VND)">
            <NumInput value={overtimeRate} onChange={setOvertimeRate} />
          </Field>
          <SaveButton dirty={dirty} saving={saving} />
          <ViewPayrollLink employeeId={employeeId} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
          <Field icon={Wallet} label="Lương cứng (VND)">
            <NumInput value={salary} onChange={setSalary} />
          </Field>
          <Field icon={CalendarOff} label="Ngày phép (có thể .25/.5/.75)">
            <input
              type="number"
              step="0.25"
              min="0"
              max="100"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value) || 0)}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
            />
          </Field>
          <SaveButton dirty={dirty} saving={saving} />
          <ViewPayrollLink employeeId={employeeId} />
        </div>
      )}
    </form>
  );
}

function TypeBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 h-7 rounded-md text-xs font-medium transition",
        active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700",
      )}
    >
      {label}
    </button>
  );
}

function NumInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={formatNum(value)}
      onChange={(e) => onChange(parseNum(e.target.value))}
      className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
    />
  );
}

function SaveButton({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  return (
    <button
      type="submit"
      disabled={!dirty || saving}
      className="h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm font-medium hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
      Lưu
    </button>
  );
}

function ViewPayrollLink({ employeeId }: { employeeId: string }) {
  return (
    <Link
      href={`/admin/employees/${employeeId}/payroll`}
      className="h-9 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 inline-flex items-center gap-1.5"
    >
      <ExternalLink size={14} /> Xem lương
    </Link>
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
