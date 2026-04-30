"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  Calendar,
  FileText,
  Loader2,
  CheckCircle2,
  Plus,
  X,
  AlertTriangle,
  Wallet,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import type { ViolationKind } from "@/types/db";
import { cn } from "@/lib/utils";

type Item = { description: string; amount: string };

function formatAmount(digits: string): string {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function parseAmount(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

export default function ViolationReportForm() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [kind, setKind] = useState<ViolationKind | null>(null);
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

  const isBonus = kind === "bonus";
  const labels = isBonus
    ? {
        section: "Mục thưởng",
        descPlaceholder: "vd: Góp ý hệ thống",
        amountLabel: "Tiền thưởng",
        addBtn: "Thêm mục thưởng",
        totalLabel: "Tổng tiền thưởng",
        submitBtn: "Gửi đơn thưởng",
        toneText: "text-emerald-700",
        toneBg: "bg-emerald-50",
        toneBorder: "border-emerald-200",
      }
    : {
        section: "Lỗi vi phạm",
        descPlaceholder: "vd: làm sai quy trình",
        amountLabel: "Tiền phạt",
        addBtn: "Thêm lỗi vi phạm",
        totalLabel: "Tổng tiền phạt",
        submitBtn: "Gửi đơn vi phạm",
        toneText: "text-rose-700",
        toneBg: "bg-rose-50",
        toneBorder: "border-rose-200",
      };

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
    if (!kind) {
      setErr("Vui lòng chọn danh mục Thưởng hoặc Vi phạm");
      return;
    }
    const cleanItems = items
      .map((it) => ({ description: it.description.trim(), amount: Number(it.amount) || 0 }))
      .filter((it) => it.description.length > 0);
    if (cleanItems.length === 0) {
      setErr(`Vui lòng nhập ít nhất 1 ${isBonus ? "mục thưởng" : "lỗi vi phạm"}`);
      return;
    }
    if (cleanItems.some((it) => Number.isNaN(it.amount) || it.amount < 0)) {
      setErr("Số tiền không hợp lệ");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
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
      setKind(null);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl glass border border-white/60 p-5 space-y-4">
      {/* Kind selector — luôn hiện ở đầu */}
      <div>
        <div className="text-xs font-medium text-neutral-600 mb-2">Danh mục</div>
        <div className="grid grid-cols-2 gap-2">
          <KindButton
            active={kind === "bonus"}
            onClick={() => setKind("bonus")}
            tone="emerald"
            icon={Sparkles}
            label="Thưởng"
          />
          <KindButton
            active={kind === "violation"}
            onClick={() => setKind("violation")}
            tone="rose"
            icon={ShieldAlert}
            label="Vi phạm"
          />
        </div>
      </div>

      {kind && (
        <>
          <Row icon={Calendar} label="Ngày tháng">
            <DateTimeBox>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm"
              />
            </DateTimeBox>
          </Row>

          <div>
            <div className="text-xs font-medium text-neutral-600 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-neutral-400" />
              {labels.section} ({items.length})
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-xl border border-neutral-200 bg-white p-2.5 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={labels.descPlaceholder}
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
                    <span className="text-xs text-neutral-500 shrink-0 w-16">{labels.amountLabel}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatAmount(it.amount)}
                      onChange={(e) => updateItem(i, { amount: parseAmount(e.target.value) })}
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
              <Plus size={14} /> {labels.addBtn}
            </button>
          </div>

          <Row icon={Wallet} label={labels.totalLabel}>
            <div className={cn("h-11 w-full rounded-xl border px-3 flex items-center text-sm font-semibold tabular-nums", labels.toneBorder, labels.toneBg, labels.toneText)}>
              {total.toLocaleString("en-US")} VND
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
        </>
      )}

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {ok && (
        <p className="text-sm text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 size={16} /> {ok}
        </p>
      )}

      <Button size="lg" disabled={loading || !kind} className="w-full">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {!kind ? "Chọn danh mục để tiếp tục" : loading ? "Đang gửi..." : (labels.submitBtn)}
      </Button>
    </form>
  );
}

function KindButton({
  active,
  onClick,
  tone,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  tone: "emerald" | "rose";
  icon: React.ComponentType<{ size?: number }>;
  label: string;
}) {
  const activeCls = tone === "emerald"
    ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20"
    : "border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-500/20";
  const idleCls = "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-12 rounded-xl border-2 font-semibold transition flex items-center justify-center gap-2",
        active ? activeCls : idleCls,
      )}
    >
      <Icon size={16} />
      {label}
    </button>
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

/** Wrapper cố định 44px cho native date input — tránh iOS render quá to */
function DateTimeBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 flex items-center focus-within:border-neutral-900 focus-within:ring-2 focus-within:ring-neutral-900/5 transition">
      {children}
    </div>
  );
}
