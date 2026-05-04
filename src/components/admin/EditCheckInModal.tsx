"use client";

import { useState } from "react";
import { Pencil, X, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeInput } from "@/components/ui/TimeInput";

export default function EditCheckInModal({
  checkInId,
  initialKind,
  initialAtIso,
  employeeName,
  action,
}: {
  checkInId: string;
  initialKind: "in" | "out";
  initialAtIso: string;
  employeeName: string;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  // Pre-fill date + time của check-in theo giờ VN
  const vnDate = vnDateOf(initialAtIso);
  const vnTime = vnTimeOf(initialAtIso);
  const [date, setDate] = useState(vnDate);
  const [time, setTime] = useState(vnTime);
  const [kind, setKind] = useState<"in" | "out">(initialKind);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("id", checkInId);
    fd.set("date", date);
    fd.set("time", time);
    fd.set("kind", kind);
    fd.set("reason", reason);
    try {
      await action(fd);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Sửa giờ chấm công"
        className="h-8 w-8 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-amber-300 hover:text-amber-600 flex items-center justify-center"
      >
        <Pencil size={14} />
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
                <h3 className="font-semibold text-lg">Sửa chấm công</h3>
                <p className="text-xs text-neutral-500">{employeeName}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="h-8 w-8 rounded text-neutral-400 hover:bg-neutral-100 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>

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
                placeholder="vd: NV check-in trễ do app load chậm"
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
                disabled={saving}
                className="flex-1 h-10 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Lưu
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

// VN date/time string từ ISO timestamp (không dùng formatVN để tránh import server-only)
function vnDateOf(iso: string): string {
  const d = new Date(iso);
  // VN = UTC+7
  const vn = new Date(d.getTime() + 7 * 3600_000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}-${String(vn.getUTCDate()).padStart(2, "0")}`;
}
function vnTimeOf(iso: string): string {
  const d = new Date(iso);
  const vn = new Date(d.getTime() + 7 * 3600_000);
  return `${String(vn.getUTCHours()).padStart(2, "0")}:${String(vn.getUTCMinutes()).padStart(2, "0")}`;
}
