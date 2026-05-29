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
  History,
  X,
} from "lucide-react";
import type { EmploymentType } from "@/types/db";
import { cn } from "@/lib/utils";

type LeaveLogEntry = {
  id: string;
  changed_at: string;
  delta: number;
  balance_after: number;
  event_type: string;
  note: string | null;
};

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
  const [logOpen, setLogOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<LeaveLogEntry[] | null>(null);
  const [logLoading, setLogLoading] = useState(false);

  async function openLog() {
    setLogOpen(true);
    if (logEntries !== null) return;
    setLogLoading(true);
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/leave-log`);
      const data = await res.json();
      setLogEntries(Array.isArray(data) ? data : []);
    } finally {
      setLogLoading(false);
    }
  }

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

      {/* Fields theo loại — save icon đặt cuối mỗi ô input (thay nút Lưu rời) */}
      {isParttime ? (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <Field icon={Clock} label="Lương / giờ (VND)">
            <NumInput value={hourlyRate} onChange={setHourlyRate} dirty={dirty} saving={saving} />
          </Field>
          <Field icon={Hourglass} label="Lương OT / giờ (VND)">
            <NumInput value={overtimeRate} onChange={setOvertimeRate} dirty={dirty} saving={saving} />
          </Field>
          <ViewPayrollLink employeeId={employeeId} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <Field icon={Wallet} label="Lương cứng (VND)">
            <NumInput value={salary} onChange={setSalary} dirty={dirty} saving={saving} />
          </Field>
          <Field icon={CalendarOff} label="Ngày phép (có thể .25/.5/.75)">
            <div className="flex gap-1.5 items-center">
              <div className="flex-1">
                <LeaveBalanceInput value={balance} onChange={setBalance} dirty={dirty} saving={saving} />
              </div>
              <button
                type="button"
                onClick={openLog}
                title="Lịch sử ngày phép"
                className="h-9 w-9 flex-shrink-0 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:text-indigo-600 hover:border-indigo-300 inline-flex items-center justify-center transition"
              >
                <History size={14} />
              </button>
            </div>
          </Field>
          <ViewPayrollLink employeeId={employeeId} />
        </div>
      )}

      {logOpen && (
        <LeaveLogModal
          entries={logEntries}
          loading={logLoading}
          onClose={() => setLogOpen(false)}
        />
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

// Tách thành component riêng để giữ raw text khi user gõ "2." (chưa nhập 25)
// — không bị React format ngược về số làm rớt mất dấu chấm. Cũng accept dấu phẩy
// để NV gõ "2,25" trên bàn phím VN cũng hiểu.
function LeaveBalanceInput({
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
  const [text, setText] = useState<string>(() => formatDecimal(value));

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,]/g, "");
          setText(raw);
          onChange(parseDecimal(raw));
        }}
        onBlur={() => setText(formatDecimal(value))}
        placeholder="0"
        className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-2.5 pr-10 text-sm outline-none focus:border-neutral-900 tabular-nums"
      />
      <InlineSaveBtn dirty={dirty} saving={saving} />
    </div>
  );
}

function parseDecimal(s: string): number {
  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function formatDecimal(n: number): string {
  if (!n) return "";
  return String(n);
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

const EVENT_LABELS: Record<string, string> = {
  accrual: "Cộng phép",
  admin_edit: "Admin sửa",
  leave_approved: "Duyệt đơn nghỉ",
  leave_rejected: "Từ chối đơn",
  payroll: "Chốt lương",
};

function LeaveLogModal({
  entries,
  loading,
  onClose,
}: {
  entries: LeaveLogEntry[] | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <span className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
            <History size={15} className="text-indigo-500" /> Lịch sử ngày phép
          </span>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 inline-flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-neutral-400">
              <Loader2 size={18} className="animate-spin mr-2" /> Đang tải...
            </div>
          )}
          {!loading && entries?.length === 0 && (
            <p className="text-center text-sm text-neutral-400 py-8">Chưa có lịch sử</p>
          )}
          {!loading && entries && entries.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-400 border-b border-neutral-100">
                  <th className="text-left py-1.5 font-medium">Thời gian</th>
                  <th className="text-left py-1.5 font-medium">Sự kiện</th>
                  <th className="text-right py-1.5 font-medium">+/-</th>
                  <th className="text-right py-1.5 font-medium">Số dư</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-neutral-50 last:border-0">
                    <td className="py-2 pr-2 text-neutral-500 whitespace-nowrap">
                      {new Date(e.changed_at).toLocaleString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </td>
                    <td className="py-2 pr-2">
                      <div className="text-neutral-700">{EVENT_LABELS[e.event_type] ?? e.event_type}</div>
                      {e.note && <div className="text-neutral-400 mt-0.5 leading-tight">{e.note}</div>}
                    </td>
                    <td className={cn(
                      "py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap",
                      e.delta > 0 ? "text-emerald-600" : e.delta < 0 ? "text-red-500" : "text-neutral-400",
                    )}>
                      {e.delta > 0 ? `+${e.delta}` : e.delta < 0 ? String(e.delta) : "—"}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-neutral-700 whitespace-nowrap">
                      {e.balance_after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
