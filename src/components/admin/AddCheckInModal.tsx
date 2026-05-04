"use client";

import { useState } from "react";
import { Plus, X, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeInput } from "@/components/ui/TimeInput";

type EmployeeOpt = { id: string; name: string; email: string; home_office_id: string | null };
type OfficeOpt = { id: string; name: string };

export default function AddCheckInModal({
  employees,
  offices,
  action,
}: {
  employees: EmployeeOpt[];
  offices: OfficeOpt[];
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [kind, setKind] = useState<"in" | "out">("in");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function onPickEmployee(id: string) {
    setEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    if (emp?.home_office_id) setOfficeId(emp.home_office_id);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!employeeId || !officeId) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("employee_id", employeeId);
    fd.set("office_id", officeId);
    fd.set("date", date);
    fd.set("time", time);
    fd.set("kind", kind);
    fd.set("reason", reason);
    try {
      await action(fd);
      setOpen(false);
      // Reset
      setEmployeeId("");
      setOfficeId("");
      setReason("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 inline-flex items-center gap-1.5"
      >
        <Plus size={14} /> Thêm chấm công
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <form
            onSubmit={onSubmit}
            className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg">Thêm chấm công thủ công</h3>
                <p className="text-xs text-neutral-500">Cho NV quên check-in/out</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="h-8 w-8 rounded text-neutral-400 hover:bg-neutral-100 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>

            <Field label="Nhân viên">
              <select
                required
                value={employeeId}
                onChange={(e) => onPickEmployee(e.target.value)}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900"
              >
                <option value="">— Chọn nhân viên —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · {e.email}</option>
                ))}
              </select>
            </Field>

            <Field label="Chi nhánh">
              <select
                required
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900"
              >
                <option value="">— Chọn chi nhánh —</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Loại">
              <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 gap-0.5">
                <KindBtn active={kind === "in"} onClick={() => setKind("in")} label="Check-in" />
                <KindBtn active={kind === "out"} onClick={() => setKind("out")} label="Check-out" />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Ngày">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
                />
              </Field>
              <Field label="Giờ (24h)">
                <TimeInput
                  required
                  value={time}
                  onChange={setTime}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
                />
              </Field>
            </div>

            <Field label="Lý do (không bắt buộc)">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="vd: NV quên check-in"
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900"
              />
            </Field>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 h-10 rounded-lg border border-neutral-200 bg-white text-sm font-medium hover:bg-neutral-50"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={saving || !employeeId || !officeId}
                className="flex-1 h-10 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Thêm
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function KindBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1 px-0.5">{label}</span>
      {children}
    </label>
  );
}
