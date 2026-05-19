import type { WorkShift } from "@/types/db";
import { effectiveWorkShifts } from "./workHours";
import { timeToMinutes } from "./time";

const DAY_MIN = 24 * 60;

/**
 * Ca sáng / ca chiều cố định cho online_wfh + leave_paid nửa ngày (xem
 * LeaveRequestForm.WFH_SHIFTS). Có nghỉ trưa 12:30-13:30 ngầm định ở giữa,
 * nên khi NV có đơn WFH/leave_paid ca chiều (13:30-17:30) thì ca sáng vẫn
 * kết thúc 12:30 (không phải 13:30 = lúc bắt đầu WFH).
 */
const HALF_DAY_MORNING_END = "12:30:00";
const HALF_DAY_AFTERNOON_START = "13:30:00";
const HALF_DAY_BREAK_CATEGORIES = new Set(["online_wfh", "leave_paid"]);

/**
 * Khoảng cách thời gian theo vòng tròn 24h (0..720). Vd 00:26 ↔ 23:59 = 27p
 * (không phải 1413p), nhờ đó shift-picker chọn đúng ca cận 0h.
 */
function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % DAY_MIN;
  return Math.min(d, DAY_MIN - d);
}

/**
 * Hiệu (now - target) wrap quanh 24h, trả [-720, 720].
 * Dương = sau target, âm = trước target.
 * Vd now=00:26, target=23:59 → +27 (sau end 27p, không phải sớm 1413p).
 */
function signedCircularDelta(now: number, target: number): number {
  let d = ((now - target) % DAY_MIN + DAY_MIN) % DAY_MIN;
  if (d > DAY_MIN / 2) d -= DAY_MIN;
  return d;
}

/**
 * Tính late/early cho 1 lần check-in/out.
 * Hỗ trợ:
 *   - Multi-shift parttime (chọn shift gần nhất với thời điểm)
 *   - Cross-midnight night shift HOẶC shift cận 0h (vd 20:00-23:59) với
 *     check-out sau nửa đêm
 *   - Hourly leave window override (dịch effectiveStart/End nếu có đơn nghỉ giờ)
 *
 * @param timeMinutes thời điểm chấm công, theo phút trong ngày VN (0-1439)
 */
export function computeLateEarly(opts: {
  emp: {
    email?: string | null;
    work_start_time?: string | null;
    work_end_time?: string | null;
    work_shifts?: WorkShift[] | null;
  };
  office: { work_start_time: string; work_end_time: string };
  hourlyLeave?: { start_time: string; end_time: string; category?: string | null } | null;
  kind: "in" | "out";
  timeMinutes: number;
}): { late_minutes: number | null; early_minutes: number | null } {
  const shifts = effectiveWorkShifts(
    opts.emp,
    opts.office.work_start_time,
    opts.office.work_end_time,
  );

  const closest = shifts.reduce<{ shift: WorkShift; dist: number } | null>((best, s) => {
    const t = timeToMinutes(opts.kind === "in" ? s.start : s.end);
    const distance = circularDistance(opts.timeMinutes, t);
    if (!best || distance < best.dist) return { shift: s, dist: distance };
    return best;
  }, null)!;

  let effectiveStart = closest.shift.start;
  let effectiveEnd = closest.shift.end;

  if (opts.hourlyLeave) {
    const lStart = timeToMinutes(opts.hourlyLeave.start_time);
    const lEnd = timeToMinutes(opts.hourlyLeave.end_time);
    const wStart = timeToMinutes(effectiveStart);
    const wEnd = timeToMinutes(effectiveEnd);
    // online_wfh / leave_paid nửa ngày dùng pattern WFH_SHIFTS (sáng 09:00-12:30,
    // chiều 13:30-17:30) → có nghỉ trưa ngầm. Khi shift effective end/start vì đơn
    // chiều, dùng 12:30 (kết thúc ca sáng) thay vì 13:30 (start đơn). Ngược lại
    // cho đơn sáng. leave_hourly không có nghỉ trưa → giữ logic cũ.
    const hasLunchBreak = !!opts.hourlyLeave.category
      && HALF_DAY_BREAK_CATEGORIES.has(opts.hourlyLeave.category);
    if (lStart <= wStart && lEnd > wStart) {
      effectiveStart = hasLunchBreak ? HALF_DAY_AFTERNOON_START : opts.hourlyLeave.end_time;
    }
    if (lEnd >= wEnd && lStart < wEnd) {
      effectiveEnd = hasLunchBreak ? HALF_DAY_MORNING_END : opts.hourlyLeave.start_time;
    }
  }

  const targetMin = timeToMinutes(opts.kind === "in" ? effectiveStart : effectiveEnd);
  const delta = signedCircularDelta(opts.timeMinutes, targetMin);

  if (opts.kind === "in") {
    return { late_minutes: delta > 0 ? delta : null, early_minutes: null };
  }
  return { late_minutes: null, early_minutes: delta < 0 ? -delta : null };
}
