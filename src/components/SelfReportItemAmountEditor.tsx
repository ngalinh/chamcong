"use client";

import { useRef, useState } from "react";
import { Pencil, X } from "lucide-react";

export function SelfReportItemAmountEditor({
  action,
  itemId,
  reportId,
  employeeId,
  monthStr,
  currentAmount,
  sign,
}: {
  action: (formData: FormData) => Promise<void>;
  itemId: string;
  reportId: string;
  employeeId: string;
  monthStr: string;
  currentAmount: number;
  sign: "+" | "-";
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tone = sign === "+" ? "text-emerald-700" : "text-rose-700";

  const formatted = Math.round(currentAmount).toLocaleString("en-US");

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0">
        <span className={`${tone} font-semibold tabular-nums text-sm`}>
          {sign}{formatted}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Sửa số tiền"
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
      className="inline-flex items-center gap-1 shrink-0"
    >
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="report_id" value={reportId} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="month" value={monthStr} />
      <span className={`${tone} font-semibold text-sm`}>{sign}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        name="amount"
        defaultValue={Math.round(currentAmount)}
        autoFocus
        title="Số tiền (VND)"
        className={`w-24 h-7 rounded-md border border-neutral-900 bg-white px-2 text-sm ${tone} font-semibold tabular-nums text-right outline-none`}
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
