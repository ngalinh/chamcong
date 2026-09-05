"use client";
import { useRef, useState } from "react";

export function ApplyFromSubmit({
  label = "Lưu",
  previousMonth,
  currentMonth,
  nextMonth,
}: {
  label?: string;
  previousMonth: string; // YYYY-MM
  currentMonth: string; // YYYY-MM
  nextMonth: string;    // YYYY-MM
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function submit(applyFrom: string) {
    const form = btnRef.current?.closest("form");
    if (!form) return;
    let inp = form.querySelector<HTMLInputElement>('input[name="apply_from"]');
    if (!inp) {
      inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = "apply_from";
      form.appendChild(inp);
    }
    inp.value = applyFrom;
    setOpen(false);
    form.requestSubmit();
  }

  function formatMonth(month: string) {
    const [year, monthNumber] = month.split("-");
    return `Tháng ${Number(monthNumber)}/${year}`;
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 px-3.5 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 inline-flex items-center shrink-0"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 p-5 w-80 space-y-4">
            <div>
              <p className="font-semibold text-neutral-900 text-sm">Áp dụng thay đổi từ khi nào?</p>
              <p className="text-xs text-neutral-500 mt-1">
                Chọn thời điểm % mới có hiệu lực tính trong bảng lương.
              </p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => submit(previousMonth)}
                className="w-full h-11 rounded-xl border border-neutral-200 bg-white text-neutral-700 text-sm font-medium hover:bg-neutral-50"
              >
                Tháng trước: {formatMonth(previousMonth)}
              </button>
              <button
                type="button"
                onClick={() => submit(currentMonth)}
                className="w-full h-11 rounded-xl border-2 border-indigo-500 bg-indigo-50 text-indigo-800 text-sm font-medium hover:bg-indigo-100"
              >
                Tháng này: {formatMonth(currentMonth)}
              </button>
              <button
                type="button"
                onClick={() => submit(nextMonth)}
                className="w-full h-11 rounded-xl border border-neutral-200 bg-white text-neutral-700 text-sm font-medium hover:bg-neutral-50"
              >
                Tháng sau: {formatMonth(nextMonth)}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-xs text-neutral-400 hover:text-neutral-600"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}
    </>
  );
}
