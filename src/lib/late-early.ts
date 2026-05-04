import type { WorkShift } from "@/types/db";
import { effectiveWorkShifts } from "./workHours";
import { timeToMinutes } from "./time";

/**
 * Tính late/early cho 1 lần check-in/out.
 * Hỗ trợ:
 *   - Multi-shift parttime (tìm shift gần nhất với thời điểm)
 *   - Cross-midnight night shift
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
  hourlyLeave?: { start_time: string; end_time: string } | null;
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
    const distance = Math.abs(opts.timeMinutes - t);
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
    if (lStart <= wStart && lEnd > wStart) effectiveStart = opts.hourlyLeave.end_time;
    if (lEnd >= wEnd && lStart < wEnd) effectiveEnd = opts.hourlyLeave.start_time;
  }

  const startMin = timeToMinutes(effectiveStart);
  const endMin = timeToMinutes(effectiveEnd);
  const isNightShift = endMin < startMin;
  const nowMin = opts.timeMinutes;

  if (opts.kind === "in") {
    const diff = isNightShift && nowMin < endMin
      ? nowMin + 24 * 60 - startMin
      : nowMin - startMin;
    return { late_minutes: diff > 0 ? diff : null, early_minutes: null };
  }

  const diff = isNightShift && nowMin >= startMin
    ? endMin + 24 * 60 - nowMin
    : endMin - nowMin;
  return { late_minutes: null, early_minutes: diff > 0 ? diff : null };
}
