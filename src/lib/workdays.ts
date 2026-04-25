/**
 * Đếm ngày làm việc trong tháng theo lịch công ty:
 *  - Thứ 2 → Thứ 6: 1 ngày
 *  - Thứ 7: 0.5 ngày (chỉ làm sáng)
 *  - Chủ nhật: 0
 *
 * Vd tháng 4/2026 (30 ngày, có 4 thứ 7 + 4 chủ nhật):
 *   workdays = 22 (T2-T6) + 4 × 0.5 = 24
 */
export function countWorkdaysInMonth(year: number, month: number): number {
  // month 1-12
  const daysInMonth = new Date(year, month, 0).getDate();
  let workdays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    if (dow >= 1 && dow <= 5) workdays += 1;
    else if (dow === 6) workdays += 0.5;
  }
  return workdays;
}

/** Convert "YYYY-MM" → { year, month } */
export function parseYearMonth(s: string): { year: number; month: number } | null {
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Format Date → "YYYY-MM" theo giờ VN */
export function yearMonthVN(d: Date = new Date()): string {
  // Asia/Ho_Chi_Minh: UTC+7
  const vn = new Date(d.getTime() + 7 * 3600_000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [start, endExclusive) ISO của tháng VN */
export function monthRangeVN(year: number, month: number): { startIso: string; endIso: string } {
  const startIso = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`).toISOString();
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const endIso = new Date(`${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01T00:00:00+07:00`).toISOString();
  return { startIso, endIso };
}
