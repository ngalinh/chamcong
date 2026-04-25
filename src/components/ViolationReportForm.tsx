"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Calendar, FileText, Loader2, CheckCircle2, Plus, X, AlertTriangle, Wallet } from "lucide-react";

type Item = { description: string; amount: string };

export default function ViolationReportForm() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [items, setItems] = useState<Item[]>([{ description: "", amount: "" }]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const total = useMemo(
    () => items.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    [items],
  );

  function addItem() {
    setItems((prev) => [...prev, { description: "", amount: "" }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const cleanItems = items
      .map((it) => ({ description: it.description.trim(), amount: Number(it.amount) || 0 }))
      .filter((it) => it.description.length > 0);
    if (cleanItems.length === 0) {
      setErr("Vui lòng nhập ít nhất 1 lỗi vi phạm");
      return;
    }
    if (cleanItems.some((it) => Number.isNaN(it.amount) || it.amount < 0)) {
      setErr("Tiền phạt không hợp lệ");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_date: date,
          items: cleanItems,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        throw new Error(d.error ?? "Server từ chối");
      }
      setOk("Đã gửi đơn — chờ admin duyệt");
      setItems([{ description: "", amount: "" }]);
      setReason("");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl glass border border-white/60 p-5 space-y-4">
      <Row icon={Calendar} label="Ngày tháng">
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
        />
      </Row>

      <div>
        <div className="text-xs font-medium text-neutral-600 mb-2 flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-neutral-400" />
          Lỗi vi phạm ({items.length})
        </div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-2.5 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Lỗi vi phạm (vd: Đi muộn 30p)"
                  value={it.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                  className="h-10 flex-1 min-w-0 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900"
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    aria-label="Xoá"
                    className="h-10 w-10 shrink-0 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-rose-300 hover:text-rose-600 flex items-center justify-center"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 shrink-0 w-16">Tiền phạt</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1000"
                  placeholder="0"
                  value={it.amount}
                  onChange={(e) => updateItem(i, { amount: e.target.value })}
                  className="h-10 flex-1 min-w-0 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900 tabular-nums text-right"
                />
                <span className="text-xs text-neutral-500 shrink-0">VND</span>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-2 h-9 w-full rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Thêm lỗi vi phạm
        </button>
      </div>

      <Row icon={Wallet} label="Tổng tiền phạt">
        <div className="h-11 w-full rounded-xl border border-rose-200 bg-rose-50 px-3 flex items-center text-sm font-semibold text-rose-700 tabular-nums">
          {total.toLocaleString("vi-VN")} VND
        </div>
      </Row>

      <Row icon={FileText} label="Ghi chú (không bắt buộc)">
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Giải trình thêm nếu cần"
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5 resize-none"
        />
      </Row>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {ok && (
        <p className="text-sm text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 size={16} /> {ok}
        </p>
      )}

      <Button size="lg" disabled={loading} className="w-full">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? "Đang gửi..." : "Gửi đơn vi phạm"}
      </Button>
    </form>
  );
}

function Row({
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
      <div className="text-xs font-medium text-neutral-600 mb-1.5 flex items-center gap-1.5">
        <Icon size={13} className="text-neutral-400" />
        {label}
      </div>
      {children}
    </label>
  );
}
