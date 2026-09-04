import type { WorkShift } from "@/types/db";
import { effectiveWorkShifts } from "./workHours";
import { timeToMinutes } from "./time";
import { HALF_DAY_MORNING_END, HALF_DAY_AFTERNOON_START } from "./late-early";

/**
 * Quy tắc chấm công ONLINE (không face/geo) cho NV chi nhánh thật:
 *
 *   1. NV gửi đơn "làm online" hôm nay (category online_*, KHÔNG cần duyệt) →
 *      phải chấm công ONLINE cho đúng ca đã xin online. Xin cả ngày → online cả
 *      ngày; xin ca sáng/chiều (WFH nửa ngày) → online ca đó, ca còn lại vẫn
 *      chấm tại văn phòng như thường. Đi muộn vẫn tính so giờ vào ca (vd 9:00).
 *
 *   2. Sáng THỨ 7: NV chi nhánh VP Sài Gòn tự động chấm công online theo giờ
 *      sáng 09:00–13:00 (hoặc ca sáng riêng của NV, cap ở 13:00). NV SG có ca
 *      riêng KHÔNG có buổi sáng (vd ca chiều) → bỏ qua, không làm T7. Chi nhánh
 *      khác không yêu cầu T7.
 *
 * Ghi nhận check-in vào chi nhánh gốc của NV (SG/HN) — không phải office remote.
 */

const NOON_MIN = 12 * 60;
const DAY_MIN = 24 * 60;
/** Giờ tan ca sáng T7 (làm online sáng thứ 7). */
export const SAT_MORNING_END = "13:00:00";

export type DaySegment = { start: string; end: string; online: boolean };

/**
 * Một lần check-in online trong ngày không mở lại phép tính đi muộn nếu nhân
 * viên đã bắt đầu ngày làm việc tại văn phòng. Trường hợp phổ biến là làm ở
 * công ty buổi sáng, check-out để di chuyển, rồi check-in lại ở nhà buổi chiều.
 *
 * Chỉ miễn `late` cho lần check-in online sau một lần check-in vật lý; nhân viên
 * làm remote cả ngày và các ca văn phòng độc lập vẫn giữ nguyên cách tính.
 */
export function forgiveOnlineLateAfterOfficeCheckIn(params: {
  kind: "in" | "out";
  isOnline: boolean;
  hadOfficeCheckInToday: boolean;
  lateMinutes: number | null;
}): number | null {
  if (params.kind === "in" && params.isOnline && params.hadOfficeCheckInToday) {
    return null;
  }
  return params.lateMinutes;
}

type EmpShifts = {
  email?: string | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_shifts?: WorkShift[] | null;
};

type OnlineLeave = { category: string; start_time: string | null; end_time: string | null };

/** Nhận diện chi nhánh VP Sài Gòn theo tên (hardcode, theo yêu cầu). */
export function isSaigonOffice(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes("sài gòn") ||
    n.includes("sài-gòn") ||
    n.includes("saigon") ||
    n.includes("sai gon")
  );
}

/** Thứ trong tuần theo giờ VN: 0=CN … 6=T7. */
export function vnDayOfWeek(now: Date = new Date()): number {
  return new Date(now.getTime() + 7 * 3600_000).getUTCDay();
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % DAY_MIN;
  return Math.min(d, DAY_MIN - d);
}

/**
 * NV này có phải làm online sáng T7 không (dùng cho audit vắng + gợi ý).
 * True nếu: chi nhánh gốc là VP SG (không remote) VÀ NV có ca sáng.
 */
export function worksSaturdayMorning(
  emp: EmpShifts,
  office: { name: string | null; is_remote?: boolean | null; work_start_time: string; work_end_time: string },
): boolean {
  if (office.is_remote || !isSaigonOffice(office.name)) return false;
  const shifts = effectiveWorkShifts(emp, office.work_start_time, office.work_end_time);
  return shifts.some((s) => timeToMinutes(s.start) < NOON_MIN);
}

/**
 * Dựng các đoạn ca trong ngày, mỗi đoạn có cờ `online` (chấm online, bỏ face/geo)
 * hay office (face/geo tại VP). Không xét chi nhánh remote ở đây.
 */
export function buildDaySegments(params: {
  emp: EmpShifts;
  officeName: string | null;
  officeStart: string;
  officeEnd: string;
  onlineLeaves: OnlineLeave[];
  isSaturday: boolean;
}): DaySegment[] {
  const { emp, officeName, officeStart, officeEnd, onlineLeaves, isSaturday } = params;
  const shifts = effectiveWorkShifts(emp, officeStart, officeEnd);

  if (isSaturday) {
    // Chỉ NV chi nhánh SG làm online sáng T7. Chi nhánh khác giữ hành vi thường.
    if (!isSaigonOffice(officeName)) {
      return shifts.map((s) => ({ start: s.start, end: s.end, online: false }));
    }
    // Ca sáng của NV (start < 12:00). Không có ca sáng (vd ca chiều riêng) → bỏ qua.
    const morning = shifts
      .filter((s) => timeToMinutes(s.start) < NOON_MIN)
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))[0];
    if (!morning) return [];
    const end =
      timeToMinutes(morning.end) < timeToMinutes(SAT_MORNING_END) ? morning.end : SAT_MORNING_END;
    return [{ start: morning.start, end, online: true }];
  }

  // T2–T6: xét đơn làm online hôm nay (bất kỳ trạng thái)
  const online = onlineLeaves.filter((l) => l.category.startsWith("online_"));
  if (online.length === 0) {
    return shifts.map((s) => ({ start: s.start, end: s.end, online: false }));
  }

  // Đơn online CẢ NGÀY (không có start_time) → online toàn bộ ca.
  const fullDay = online.some((l) => !l.start_time || !l.end_time);
  if (fullDay) {
    return shifts.map((s) => ({ start: s.start, end: s.end, online: true }));
  }

  // Đơn online NỬA NGÀY: online = cửa sổ đơn; office = phần ca còn lại (nghỉ trưa ngầm).
  const windows = online
    .filter((l) => l.start_time && l.end_time)
    .map((l) => ({ start: l.start_time as string, end: l.end_time as string }));

  let officeSegs = shifts.map((s) => ({ start: s.start, end: s.end }));
  for (const w of windows) {
    const ws = timeToMinutes(w.start);
    const we = timeToMinutes(w.end);
    officeSegs = officeSegs.map((s) => {
      const ss = timeToMinutes(s.start);
      const se = timeToMinutes(s.end);
      if (ws <= ss && we > ss) return { start: HALF_DAY_AFTERNOON_START, end: s.end }; // online phủ đầu ca
      if (we >= se && ws < se) return { start: s.start, end: HALF_DAY_MORNING_END }; // online phủ cuối ca
      return s;
    });
  }
  officeSegs = officeSegs.filter((s) => timeToMinutes(s.end) > timeToMinutes(s.start));

  return [
    ...windows.map((w) => ({ start: w.start, end: w.end, online: true })),
    ...officeSegs.map((s) => ({ start: s.start, end: s.end, online: false })),
  ];
}

/**
 * Quyết định lần chấm công hiện tại là ONLINE hay office, và cửa sổ ca áp dụng
 * (để tính late/early). Dùng chung cho checkin page + /api/checkin để nhất quán.
 */
export function resolveCheckinMode(params: {
  emp: EmpShifts;
  officeName: string | null;
  officeStart: string;
  officeEnd: string;
  isRemoteOffice: boolean;
  onlineLeaves: OnlineLeave[];
  isSaturday: boolean;
  nowMin: number;
  kind: "in" | "out";
}): { online: boolean; window: { start: string; end: string } | null } {
  const segments = buildDaySegments({
    emp: params.emp,
    officeName: params.officeName,
    officeStart: params.officeStart,
    officeEnd: params.officeEnd,
    onlineLeaves: params.onlineLeaves,
    isSaturday: params.isSaturday,
  });

  if (segments.length === 0) {
    // Vd NV SG ca chiều riêng vào T7 → không có ca nào. Office remote thì vẫn online.
    return { online: params.isRemoteOffice, window: null };
  }

  // Đoạn chứa nowMin, hoặc gần nhất theo boundary (start nếu in, end nếu out).
  const contained = segments.find(
    (s) => params.nowMin >= timeToMinutes(s.start) && params.nowMin <= timeToMinutes(s.end),
  );
  const seg =
    contained ??
    segments.reduce<{ s: DaySegment; d: number } | null>((best, s) => {
      const b = timeToMinutes(params.kind === "in" ? s.start : s.end);
      const d = circularDistance(params.nowMin, b);
      if (!best || d < best.d) return { s, d };
      return best;
    }, null)!.s;

  return {
    online: params.isRemoteOffice || seg.online,
    window: { start: seg.start, end: seg.end },
  };
}
