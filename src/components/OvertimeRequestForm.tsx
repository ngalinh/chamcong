"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Calendar, Clock, FileText, Loader2, CheckCircle2, Hourglass } from "lucide-react";

function diffHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // qua nửa đêm
  return Math.round((mins / 60) * 100) / 100;
}

export default function OvertimeRequestForm() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const hours = useMemo(() => diffHours(start, end), [start, end]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (hours <= 0) {
      setErr("Thời gian kết thúc phải sau thời gian bắt đầu");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ot_date: date,
          start_time: start,
          end_time: end,
          hours,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        throw new Error(d.error ?? "Server từ chối");
      }
      setOk("Đã gửi đơn — chờ admin duyệt");
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

      <div className="grid grid-cols-2 gap-3">
        <Row icon={Clock} label="Bắt đầu">
          <input
            type="time"
            required
            value={start}
            step={300}
            onChange={(e) => setStart(e.target.value)}
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-mono tabular-nums outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
          />
        </Row>
        <Row icon={Clock} label="Kết thúc">
          <input
            type="time"
            required
            value={end}
            step={300}
            onChange={(e) => setEnd(e.target.value)}
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-mono tabular-nums outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
          />
        </Row>
      </div>

      <Row icon={Hourglass} label="Tổng thời gian">
        <div className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 flex items-center text-sm font-medium tabular-nums">
          {hours > 0 ? `${hours} giờ` : "—"}
        </div>
      </Row>

      <Row icon={FileText} label="Lý do làm overtime">
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Mô tả công việc cần làm thêm giờ"
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
        {loading ? "Đang gửi..." : "Gửi đơn"}
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
