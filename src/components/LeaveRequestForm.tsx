"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LEAVE_CATEGORIES, type LeaveCategory, type DurationUnit } from "@/types/db";
import { Calendar, User, Tag, Clock, FileText, Loader2, CheckCircle2 } from "lucide-react";

function diffHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

export default function LeaveRequestForm({
  employeeName,
  employeeEmail,
}: {
  employeeName: string;
  employeeEmail: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<LeaveCategory>("online_wfh");
  const [duration, setDuration] = useState<string>("1");
  const [unit, setUnit] = useState<DurationUnit>("day");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const isHourly = category === "leave_hourly";
  const computedHours = useMemo(() => diffHours(startTime, endTime), [startTime, endTime]);

  // Khi chọn nghỉ theo giờ → auto đổi unit sang hour + tính duration từ time pickers
  useEffect(() => {
    if (isHourly) {
      setUnit("hour");
      if (computedHours > 0) setDuration(String(computedHours));
    }
  }, [isHourly, computedHours]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (isHourly && computedHours <= 0) {
      setErr("Thời gian kết thúc phải sau thời gian bắt đầu");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_date: date,
          category,
          duration: Number(duration),
          duration_unit: unit,
          start_time: isHourly ? startTime : null,
          end_time:   isHourly ? endTime   : null,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        throw new Error(d.error ?? "Server từ chối");
      }
      setOk("Đã gửi đơn xin nghỉ");
      setReason("");
      if (!isHourly) setDuration("1");
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

      <Row icon={User} label="Nhân viên">
        <div className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 flex items-center text-sm text-neutral-600 select-none">
          {employeeName} <span className="text-neutral-400 ml-2">· {employeeEmail}</span>
        </div>
      </Row>

      <Row icon={Tag} label="Danh mục">
        <select
          required
          value={category}
          onChange={(e) => setCategory(e.target.value as LeaveCategory)}
          className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
        >
          {Object.entries(LEAVE_CATEGORIES).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </Row>

      {isHourly ? (
        <>
          <Row icon={Clock} label="Thời gian bắt đầu">
            <DateTimeBox>
              <input
                type="time"
                required
                value={startTime}
                step={300}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm font-mono tabular-nums"
              />
            </DateTimeBox>
          </Row>
          <Row icon={Clock} label="Thời gian kết thúc">
            <DateTimeBox>
              <input
                type="time"
                required
                value={endTime}
                step={300}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm font-mono tabular-nums"
              />
            </DateTimeBox>
          </Row>
          <Row icon={Clock} label="Tổng thời gian">
            <div className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 flex items-center text-sm font-medium tabular-nums">
              {computedHours > 0 ? `${computedHours} giờ` : "—"}
            </div>
          </Row>
        </>
      ) : (
        <Row icon={Clock} label="Thời gian">
          <div className="flex gap-2">
            <input
              type="number"
              required
              min="0.5"
              max="30"
              step="0.5"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5 tabular-nums"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as DurationUnit)}
              className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
            >
              <option value="day">Ngày</option>
              <option value="hour">Giờ</option>
            </select>
          </div>
        </Row>
      )}

      <Row icon={FileText} label="Lý do">
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Mô tả lý do (không bắt buộc)"
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
        {loading ? "Đang gửi..." : "Gửi đơn xin nghỉ"}
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

/** Wrapper cố định 40px cho native date/time input — tránh iOS render quá to */
function DateTimeBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 flex items-center focus-within:border-neutral-900 focus-within:ring-2 focus-within:ring-neutral-900/5 transition">
      {children}
    </div>
  );
}
