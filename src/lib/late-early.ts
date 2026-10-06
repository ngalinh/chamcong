import type { WorkShift } from "@/types/db";
import { effectiveWorkShifts } from "./workHours";
import { formatVN, timeToMinutes } from "./time";

const DAY_MIN = 24 * 60;

/**
 * Ca sáng / ca chiều cố định cho online_wfh + leave_paid nửa ngày (xem
 * LeaveRequestForm.WFH_SHIFTS). Có nghỉ trưa 12:30-13:30 ngầm định ở giữa,
 * nên khi NV có đơn WFH/leave_paid ca chiều (13:30-17:30) thì ca sáng vẫn
 * kết thúc 12:30 (không phải 13:30 = lúc bắt đầu WFH).
 */
export const HALF_DAY_MORNING_END = "12:30:00";
export const HALF_DAY_AFTERNOON_START = "13:30:00";
const HALF_DAY_BREAK_CATEGORIES = new Set(["online_wfh", "online_rain", "leave_paid"]);

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
  hourlyLeaves?: Array<{ start_time: string; end_time: string; category?: string | null }> | null;
  kind: "in" | "out";
  timeMinutes: number;
  /** Check-out: giờ (phút VN) của lần check-in mở ca này — xem pairedInMinutes(). */
  pairedInMinutes?: number | null;
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
  // Ca online nửa ngày (WFH / trời mưa) — để biết lần chấm đang mở/đóng ca online hay ca văn phòng
  // (vd check-out 12:50 sau WFH sáng 09:00-12:30 là đóng ca online, không phải
  // về sớm so với 17:30). Khớp resolveCheckinMode.
  const onlineWindows: Array<{ start: string; end: string }> = [];

  // Áp dụng từng đơn nghỉ theo giờ — mỗi đơn có thể dịch effectiveStart hoặc effectiveEnd.
  // online_wfh / online_rain / leave_paid nửa ngày dùng pattern WFH_SHIFTS (sáng 09:00-12:30,
  // chiều 13:30-17:30) → có nghỉ trưa ngầm. leave_hourly không có nghỉ trưa → giữ logic cũ.
  for (const hl of opts.hourlyLeaves ?? []) {
    const lStart = timeToMinutes(hl.start_time);
    const lEnd = timeToMinutes(hl.end_time);
    const hasLunchBreak = !!hl.category && HALF_DAY_BREAK_CATEGORIES.has(hl.category);

    if (hasLunchBreak) {
      // online_wfh / online_rain / leave_paid nửa ngày luôn dùng mốc cố định WFH_SHIFTS
      // (09:00-12:30 sáng / 13:30-17:30 chiều), KHÔNG phụ thuộc giờ làm thực
      // tế của chi nhánh/NV. So theo mốc cố định thay vì so với
      // effectiveStart/End — nếu so với wStart thực tế (vd office bắt đầu
      // 08:30 < 09:00) thì điều kiện lStart<=wStart sẽ sai, khiến nửa ngày
      // nghỉ sáng không dời được effectiveStart sang chiều.
      const isMorning = lEnd <= timeToMinutes(HALF_DAY_MORNING_END);
      const isAfternoon = lStart >= timeToMinutes(HALF_DAY_AFTERNOON_START);
      if (isMorning) {
        effectiveStart = HALF_DAY_AFTERNOON_START;
      } else if (isAfternoon) {
        effectiveEnd = HALF_DAY_MORNING_END;
      }
      if (hl.category !== "leave_paid" && (isMorning || isAfternoon)) {
        onlineWindows.push({ start: hl.start_time, end: hl.end_time });
      }
      continue;
    }

    const wStart = timeToMinutes(effectiveStart);
    const wEnd = timeToMinutes(effectiveEnd);
    if (lStart <= wStart && lEnd > wStart) {
      effectiveStart = hl.end_time;
    }
    if (lEnd >= wEnd && lStart < wEnd) {
      effectiveEnd = hl.start_time;
    }
  }

  // Ca (VP hoặc online) mà 1 lần check-in thuộc về: nằm trong cửa sổ online →
  // online; còn lại → mốc vào gần nhất.
  const officeSeg = { start: effectiveStart, end: effectiveEnd };
  const segOfCheckIn = (inMin: number) =>
    onlineWindows.find((w) => inMin >= timeToMinutes(w.start) && inMin <= timeToMinutes(w.end)) ??
    [officeSeg, ...onlineWindows].reduce((best, w) =>
      circularDistance(inMin, timeToMinutes(w.start)) < circularDistance(inMin, timeToMinutes(best.start)) ? w : best,
    );

  let targetMin: number;
  if (opts.kind === "in") {
    targetMin = timeToMinutes(segOfCheckIn(opts.timeMinutes).start);
  } else if (opts.pairedInMinutes != null) {
    // Check-out đóng đúng ca đã check-in: vào VP 13:35 (sau WFH sáng) rồi ra
    // 15:00 → vẫn về sớm so với 17:30, dù 15:00 gần 12:30 hơn.
    targetMin = timeToMinutes(segOfCheckIn(opts.pairedInMinutes).end);
  } else {
    targetMin = [officeSeg, ...onlineWindows]
      .map((w) => timeToMinutes(w.end))
      .reduce((best, t) =>
        circularDistance(opts.timeMinutes, t) < circularDistance(opts.timeMinutes, best) ? t : best,
      );
  }
  const delta = signedCircularDelta(opts.timeMinutes, targetMin);

  if (opts.kind === "in") {
    return { late_minutes: delta > 0 ? delta : null, early_minutes: null };
  }
  return { late_minutes: null, early_minutes: delta < 0 ? -delta : null };
}

/**
 * Giờ (phút VN) của lần check-in gần nhất TRƯỚC thời điểm `atIso` — tức lần
 * check-in mà 1 check-out tại `atIso` đóng lại. Null nếu không có.
 */
export function pairedInMinutes(
  checkIns: Array<{ id?: string; kind: string; checked_in_at: string }>,
  atIso: string,
  excludeId?: string,
): number | null {
  const at = new Date(atIso).getTime();
  const prev = checkIns
    .filter((c) => c.id !== excludeId && new Date(c.checked_in_at).getTime() < at)
    .sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime())[0];
  if (!prev || prev.kind !== "in") return null;
  return timeToMinutes(formatVN(prev.checked_in_at, "HH:mm"));
}

/**
 * Check-in admin thêm thủ công (NV quên chấm) không tính muộn / về sớm. Từ
 * 01/09/2026 bỏ qua cả late/early cũ còn lưu trong DB (trước khi fix vẫn bị
 * tính); tháng trước giữ nguyên để khớp lương đã trả.
 */
const MANUAL_CHECKIN_EXEMPT_FROM = new Date("2026-09-01T00:00:00+07:00").getTime();
export function isExemptManualCheckIn(ci: { created_by_admin_email?: string | null; checked_in_at: string }): boolean {
  return !!ci.created_by_admin_email && new Date(ci.checked_in_at).getTime() >= MANUAL_CHECKIN_EXEMPT_FROM;
}
