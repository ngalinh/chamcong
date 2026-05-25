"use client";

import { useRef, useState } from "react";
import { Pencil, X } from "lucide-react";

export function LeaveHourlyDeductionEditor({
  action,
  leaveId,
  leaveDate,
  employeeId,
  currentDeduction,
}: {
  action: (formData: FormData) => Promise<void>;
  leaveId: string;
  leaveDate: string;
  employeeId: string;
  currentDeduction: number;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatted = Math.round(currentDeduction).toLocaleString("en-US");

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1 ml-2 shrink-0">
        <span className="text-rose-700 font-semibold tabular-nums text-sm">
          −{formatted}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Sửa số tiền trừ"
          className="h-6 w-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
        >
          <Pencil size={12} />
        </button>
      </span>
    );
  }

  return (
    <form
      action={action}
      onSubmit={() => setEditing(false)}
      className="inline-flex items-center gap-1 ml-2 shrink-0"
    >
      <input type="hidden" name="leave_id" value={leaveId} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="leave_date" value={leaveDate} />
      <span className="text-rose-700 font-semibold text-sm">−</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        name="override"
        defaultValue={Math.round(currentDeduction)}
        autoFocus
        title="Số tiền trừ (VND). Bỏ trống để dùng auto-compute."
        className="w-28 h-7 rounded-md border border-neutral-900 bg-white px-2 text-sm text-rose-700 font-semibold tabular-nums text-right outline-none"
      />
      <button
        type="submit"
        className="h-7 px-2 rounded-md text-xs font-medium border border-neutral-200 bg-white hover:bg-neutral-50"
      >
        Lưu
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="h-7 w-7 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 border border-neutral-200"
      >
        <X size={12} />
      </button>
    </form>
  );
}
