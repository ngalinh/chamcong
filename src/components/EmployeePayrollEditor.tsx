"use client";

import { useState } from "react";
import { Loader2, Check, Pencil, X } from "lucide-react";
import type { EmploymentType } from "@/types/db";
import { cn } from "@/lib/utils";

function currentMonthVN(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function nextMonthVN(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `T${Number(m)}/${y}`;
}

export default function EmployeePayrollEditor({
  employeeId,
  initialEmploymentType,
  initialSalary,
  initialHourlyRate,
  initialOvertimeRate,
  initialSalaryPending,
  initialSalaryPendingMonth,
  action,
}: {
  employeeId: string;
  initialEmploymentType: EmploymentType;
  initialSalary: number;
  initialHourlyRate: number;
  initialOvertimeRate: number;
  initialSalaryPending?: number | null;
  initialSalaryPendingMonth?: string | null;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const curMonth = currentMonthVN();
  // Nếu pending đã đến tháng áp dụng, hiển thị giá trị pending như là current
  const resolvedSalary =
    initialSalaryPending !== null &&
    initialSalaryPending !== undefined &&
    initialSalaryPendingMonth &&
    initialSalaryPendingMonth <= curMonth
      ? initialSalaryPending
      : initialSalary;

  const [salary, setSalary] = useState(resolvedSalary);
  const [hourlyRate, setHourlyRate] = useState(initialHourlyRate);
  const [overtimeRate, setOvertimeRate] = useState(initialOvertimeRate);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingFd, setPendingFd] = useState<FormData | null>(null);

  const isParttime = initialEmploymentType === "parttime";

  const dirty = isParttime
    ? hourlyRate !== initialHourlyRate || overtimeRate !== initialOvertimeRate
    : salary !== resolvedSalary;

  const hasFuturePending =
    !isParttime &&
    initialSalaryPending !== null &&
    initialSalaryPending !== undefined &&
    initialSalaryPendingMonth &&
    initialSalaryPendingMonth > curMonth;

  function buildFd(): FormData {
    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("employment_type", initialEmploymentType);
    fd.set("salary", String(salary));
    fd.set("hourly_rate", String(hourlyRate));
    fd.set("overtime_rate", String(overtimeRate));
    return fd;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    if (!isParttime) {
      // Fulltime salary = lương cứng → cần hỏi tháng áp dụng
      setPendingFd(buildFd());
    } else {
      // Parttime: apply ngay
      await doSave(buildFd(), "current");
    }
  }

  async function doSave(fd: FormData, effectiveFrom: "current" | "next") {
    fd.set("effective_from", effectiveFrom);
    setSaving(true);
    try {
      await action(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function confirmSave(effectiveFrom: "current" | "next") {
    if (!pendingFd) return;
    const fd = pendingFd;
    setPendingFd(null);
    await doSave(fd, effectiveFrom);
  }

  return (
    <>
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
          <>
            <PayRow
              label="Cứng"
              value={salary}
              onChange={setSalary}
              unit="VND"
              dirty={dirty}
              saving={saving}
              saved={saved}
            />
            {hasFuturePending && (
              <p className="text-[10px] text-amber-600 font-medium pl-9 leading-tight">
                → {formatNum(initialSalaryPending!)} VND từ {fmtMonth(initialSalaryPendingMonth!)}
              </p>
            )}
          </>
        )}
      </form>

      {pendingFd && (
        <EffectiveMonthDialog
          newValue={salary}
          onConfirm={confirmSave}
          onCancel={() => setPendingFd(null)}
        />
      )}
    </>
  );
}

function EffectiveMonthDialog({
  newValue,
  onConfirm,
  onCancel,
}: {
  newValue: number;
  onConfirm: (effectiveFrom: "current" | "next") => void;
  onCancel: () => void;
}) {
  const cur = currentMonthVN();
  const nxt = nextMonthVN();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-neutral-900 text-[15px]">Áp dụng lương cứng mới từ khi nào?</p>
            <p className="text-[13px] text-neutral-500 mt-0.5 tabular-nums">
              {formatNum(newValue)} VND
            </p>
          </div>
          <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-600 mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm("current")}
            className="w-full rounded-xl bg-indigo-600 text-white py-2.5 text-[14px] font-semibold hover:bg-indigo-700 transition"
          >
            Tháng này — {fmtMonth(cur)}
          </button>
          <button
            onClick={() => onConfirm("next")}
            className="w-full rounded-xl bg-neutral-100 text-neutral-700 py-2.5 text-[14px] font-semibold hover:bg-neutral-200 transition"
          >
            Tháng sau — {fmtMonth(nxt)}
          </button>
        </div>
      </div>
    </div>
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
