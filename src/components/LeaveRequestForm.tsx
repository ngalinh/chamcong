"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TimeInput } from "@/components/ui/TimeInput";
import { LEAVE_CATEGORIES, ACTIVE_LEAVE_CATEGORIES, type LeaveCategory, type DurationUnit } from "@/types/db";
import { Calendar, User, Tag, Clock, FileText, Loader2, CheckCircle2, Plus, X, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

function diffHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

type WfhMode = "full_day" | "morning" | "afternoon";
type LeavePaidMode = "full_day" | "morning" | "afternoon";
const WFH_SHIFTS: Record<Exclude<WfhMode, "full_day">, { start: string; end: string }> = {
  morning:   { start: "09:00", end: "12:30" },
  afternoon: { start: "13:30", end: "17:30" },
};

export default function LeaveRequestForm({
  employeeName,
  employeeEmail,
}: {
  employeeName: string;
  employeeEmail: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [dates, setDates] = useState<string[]>([today]);
  const [category, setCategory] = useState<LeaveCategory>("online_wfh");
  const [wfhMode, setWfhMode] = useState<WfhMode>("full_day");
  const [rainMode, setRainMode] = useState<WfhMode>("full_day");
  const [leavePaidMode, setLeavePaidMode] = useState<LeavePaidMode>("full_day");
  const [duration, setDuration] = useState<string>("1");
  const [unit, setUnit] = useState<DurationUnit>("day");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const isHourly = category === "leave_hourly";
  const isWfh = category === "online_wfh";
  const isRain = category === "online_rain";
  const isWfhHalf = isWfh && wfhMode !== "full_day";
  const isRainHalf = isRain && rainMode !== "full_day";
  const dayOnly = category === "leave_paid"; // Nghỉ theo ngày — duration = số ngày
  const isLeavePaidHalf = dayOnly && leavePaidMode !== "full_day";

  const computedHours = useMemo(() => diffHours(startTime, endTime), [startTime, endTime]);
  const validDateCount = useMemo(() => dates.filter((d) => d.trim()).length, [dates]);

  // Sync time + force single-date khi chuyển mode/category
  useEffect(() => {
    if (isHourly) {
      setUnit("hour");
      if (computedHours > 0) setDuration(String(computedHours));
      setDates((prev) => (prev.length > 1 ? [prev[0]] : prev));
    } else if (isWfhHalf) {
      const shift = WFH_SHIFTS[wfhMode as "morning" | "afternoon"];
      setStartTime(shift.start);
      setEndTime(shift.end);
      setDates((prev) => (prev.length > 1 ? [prev[0]] : prev));
    } else if (isRainHalf) {
      const shift = WFH_SHIFTS[rainMode as "morning" | "afternoon"];
      setStartTime(shift.start);
      setEndTime(shift.end);
      setDates((prev) => (prev.length > 1 ? [prev[0]] : prev));
    } else if (isLeavePaidHalf) {
      const shift = WFH_SHIFTS[leavePaidMode as "morning" | "afternoon"];
      setStartTime(shift.start);
      setEndTime(shift.end);
      setUnit("day");
      setDates((prev) => (prev.length > 1 ? [prev[0]] : prev));
    } else if (dayOnly || (isWfh && wfhMode === "full_day") || (isRain && rainMode === "full_day")) {
      setUnit("day");
    }
  }, [isHourly, isWfh, isRain, isWfhHalf, isRainHalf, isLeavePaidHalf, wfhMode, rainMode, leavePaidMode, dayOnly, computedHours]);

  function addDate() { setDates((prev) => [...prev, ""]); }
  function removeDate(idx: number) { setDates((prev) => prev.filter((_, i) => i !== idx)); }
  function updateDate(idx: number, value: string) {
    setDates((prev) => prev.map((d, i) => (i === idx ? value : d)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const cleanDates = dates.map((d) => d.trim()).filter(Boolean);
    if (cleanDates.length === 0) {
      setErr("Vui lòng chọn ít nhất 1 ngày");
      return;
    }
    if (new Set(cleanDates).size !== cleanDates.length) {
      setErr("Các ngày bị trùng nhau");
      return;
    }
    if (isHourly && computedHours <= 0) {
      setErr("Thời gian kết thúc phải sau thời gian bắt đầu");
      return;
    }

    // Quyết định payload theo từng trường hợp
    const useHourly = isHourly || isWfhHalf || isRainHalf;
    let submitDuration: number;
    let submitUnit: DurationUnit;
    if (useHourly) {
      submitDuration = computedHours;
      submitUnit = "hour";
    } else if (isLeavePaidHalf) {
      submitDuration = 0.5;
      submitUnit = "day";
    } else if (dayOnly || (isWfh && wfhMode === "full_day") || (isRain && rainMode === "full_day")) {
      // Mỗi ngày trong đợt xin nghỉ tạo 1 row riêng (xem api/leave/route.ts) —
      // duration phải là số ngày CỦA TỪNG ROW (luôn = 1), không phải tổng số
      // ngày cả đợt. Gán tổng số ngày ở đây từng làm mỗi row bị tính duration
      // = tổng, khiến 1 đợt xin nghỉ N ngày bị trừ N² ngày phép.
      submitDuration = 1;
      submitUnit = "day";
    } else {
      submitDuration = Number(duration);
      submitUnit = unit;
    }
    const includeShiftTimes = useHourly || isLeavePaidHalf;

    setLoading(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_dates: cleanDates.sort(),
          category,
          duration: submitDuration,
          duration_unit: submitUnit,
          start_time: includeShiftTimes ? startTime : null,
          end_time:   includeShiftTimes ? endTime   : null,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        throw new Error(d.error ?? "Server từ chối");
      }
      setOk(cleanDates.length > 1 ? `Đã gửi ${cleanDates.length} đơn xin nghỉ` : "Đã gửi đơn xin nghỉ");
      setReason("");
      setDates([today]);
      if (!useHourly && !isLeavePaidHalf) setDuration("1");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const allowMultiDate = !isHourly && !isWfhHalf && !isRainHalf && !isLeavePaidHalf;

  return (
    <form onSubmit={submit} className="rounded-2xl glass border border-white/60 p-5 space-y-4">
      <Row icon={Calendar} label={dates.length > 1 ? `Ngày tháng (${dates.length} ngày)` : "Ngày tháng"}>
        <div className="space-y-2">
          {dates.map((d, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="date"
                required
                value={d}
                onChange={(e) => updateDate(i, e.target.value)}
                className="h-10 flex-1 min-w-0 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
              />
              {dates.length > 1 && (
                <button
                  type="button"
                  aria-label="Xoá ngày"
                  onClick={() => removeDate(i)}
                  className="h-10 w-10 shrink-0 rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-rose-300 hover:text-rose-600 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          {allowMultiDate && (
            <button
              type="button"
              onClick={addDate}
              className="h-9 w-full rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 flex items-center justify-center gap-1.5"
            >
              <Plus size={14} /> Thêm ngày
            </button>
          )}
        </div>
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
          onChange={(e) => {
            setCategory(e.target.value as LeaveCategory);
            setWfhMode("full_day");
            setRainMode("full_day");
            setLeavePaidMode("full_day");
          }}
          className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
        >
          {ACTIVE_LEAVE_CATEGORIES.map((k) => (
            <option key={k} value={k}>{LEAVE_CATEGORIES[k]}</option>
          ))}
        </select>
      </Row>

      {/* online_rain: 3 buttons + display tự động */}
      {isRain && (
        <Row icon={Clock} label="Hình thức làm online">
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <ModeButton active={rainMode === "full_day"}  onClick={() => setRainMode("full_day")}  icon={Calendar} label="Ngày" />
              <ModeButton active={rainMode === "morning"}   onClick={() => setRainMode("morning")}   icon={Sun}      label="Ca sáng" />
              <ModeButton active={rainMode === "afternoon"} onClick={() => setRainMode("afternoon")} icon={Moon}     label="Ca chiều" />
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              Thời gian làm online:{" "}
              <b className="tabular-nums">
                {rainMode === "full_day"
                  ? `${validDateCount || 1} ngày`
                  : `${WFH_SHIFTS[rainMode].start} - ${WFH_SHIFTS[rainMode].end}`}
              </b>
              <span className="text-neutral-400 ml-1">(tự động)</span>
            </div>
            {rainMode !== "full_day" && (
              <p className="text-xs text-neutral-500">
                Bạn vẫn cần chấm công <b>tại văn phòng</b> ca {rainMode === "morning" ? "chiều (13:30 - 17:30)" : "sáng (09:00 - 12:30)"}.
              </p>
            )}
          </div>
        </Row>
      )}

      {/* WFH: 3 buttons + display tự động */}
      {isWfh && (
        <Row icon={Clock} label="Hình thức làm online">
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <ModeButton active={wfhMode === "full_day"} onClick={() => setWfhMode("full_day")} icon={Calendar} label="Ngày" />
              <ModeButton active={wfhMode === "morning"}  onClick={() => setWfhMode("morning")}  icon={Sun}      label="Ca sáng" />
              <ModeButton active={wfhMode === "afternoon"} onClick={() => setWfhMode("afternoon")} icon={Moon}    label="Ca chiều" />
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              Thời gian làm online:{" "}
              <b className="tabular-nums">
                {wfhMode === "full_day"
                  ? `${validDateCount || 1} ngày`
                  : `${WFH_SHIFTS[wfhMode].start} - ${WFH_SHIFTS[wfhMode].end}`}
              </b>
              <span className="text-neutral-400 ml-1">(tự động)</span>
            </div>
            {wfhMode !== "full_day" && (
              <p className="text-xs text-neutral-500">
                Bạn vẫn cần chấm công <b>tại văn phòng</b> ca {wfhMode === "morning" ? "chiều (13:30 - 17:30)" : "sáng (09:00 - 12:30)"}.
              </p>
            )}
          </div>
        </Row>
      )}

      {/* leave_hourly: time pickers */}
      {isHourly && (
        <>
          <Row icon={Clock} label="Thời gian bắt đầu (24h)">
            <DateTimeBox>
              <TimeInput required value={startTime} onChange={setStartTime} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm font-mono tabular-nums" />
            </DateTimeBox>
          </Row>
          <Row icon={Clock} label="Thời gian kết thúc (24h)">
            <DateTimeBox>
              <TimeInput required value={endTime} onChange={setEndTime} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm font-mono tabular-nums" />
            </DateTimeBox>
          </Row>
          <Row icon={Clock} label="Tổng thời gian">
            <div className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 flex items-center text-sm font-medium tabular-nums">
              {computedHours > 0 ? `${computedHours} giờ` : "—"}
            </div>
          </Row>
        </>
      )}

      {/* leave_paid (nghỉ theo ngày): chọn cả ngày / ca sáng / ca chiều */}
      {dayOnly && (
        <Row icon={Clock} label="Thời gian nghỉ">
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <ModeButton active={leavePaidMode === "full_day"}  onClick={() => setLeavePaidMode("full_day")}  icon={Calendar} label="Cả ngày" />
              <ModeButton active={leavePaidMode === "morning"}   onClick={() => setLeavePaidMode("morning")}   icon={Sun}      label="Ca sáng" />
              <ModeButton active={leavePaidMode === "afternoon"} onClick={() => setLeavePaidMode("afternoon")} icon={Moon}     label="Ca chiều" />
            </div>
            {leavePaidMode === "full_day" ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                <b className="tabular-nums">{validDateCount || 1} ngày</b>
                <span className="text-neutral-400 ml-1">(tự động theo số ngày bạn thêm ở trên)</span>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">
                Trừ <b>0.5</b> ngày phép. Bạn vẫn cần chấm công ca {leavePaidMode === "morning" ? "chiều" : "sáng"} còn lại.
              </p>
            )}
          </div>
        </Row>
      )}

      {/* Các category còn lại: giữ input số + selector ngày/giờ như cũ */}
      {!isWfh && !isRain && !isHourly && !dayOnly && (
        <Row icon={Clock} label={dates.length > 1 ? "Thời gian (mỗi ngày)" : "Thời gian"}>
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

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-1.5 transition",
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400",
      )}
    >
      <Icon size={14} />
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

/** Wrapper cố định 40px cho native date/time input — tránh iOS render quá to */
function DateTimeBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 flex items-center focus-within:border-neutral-900 focus-within:ring-2 focus-within:ring-neutral-900/5 transition">
      {children}
    </div>
  );
}
