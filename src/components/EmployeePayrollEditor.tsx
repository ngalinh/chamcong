"use client";

import { useState } from "react";
import Link from "next/link";
import { Wallet, CalendarOff, Save, Loader2, ExternalLink } from "lucide-react";

export default function EmployeePayrollEditor({
  employeeId,
  initialSalary,
  initialLeaveBalance,
  action,
}: {
  employeeId: string;
  initialSalary: number;
  initialLeaveBalance: number;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [salary, setSalary] = useState(initialSalary);
  const [balance, setBalance] = useState(initialLeaveBalance);
  const [saving, setSaving] = useState(false);

  const dirty = salary !== initialSalary || balance !== initialLeaveBalance;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("salary", String(salary));
    fd.set("leave_balance", String(balance));
    try {
      await action(fd);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
      <Field icon={Wallet} label="Lương cứng (VND)">
        <input
          type="text"
          inputMode="numeric"
          value={formatNum(salary)}
          onChange={(e) => setSalary(parseNum(e.target.value))}
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
        />
      </Field>
      <Field icon={CalendarOff} label="Ngày phép (có thể .5)">
        <input
          type="number"
          step="0.5"
          min="0"
          max="100"
          value={balance}
          onChange={(e) => setBalance(Number(e.target.value) || 0)}
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
        />
      </Field>
      <button
        type="submit"
        disabled={!dirty || saving}
        className="h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm font-medium hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Lưu
      </button>
      <Link
        href={`/admin/employees/${employeeId}/payroll`}
        className="h-9 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 inline-flex items-center gap-1.5"
      >
        <ExternalLink size={14} /> Xem lương
      </Link>
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
