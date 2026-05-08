/**
 * Đếm ngày làm việc trong tháng để tính lương theo ngày (dayRate = salary / workdays):
 *  - Thứ 2 → Thứ 6: 1 ngày
 *  - Thứ 7: 0.5 ngày (NV làm online sáng T7, không chấm công nhưng vẫn tính lương)
 *  - Chủ nhật: 0
 *
 * Vd tháng 4/2026: 22 ngày T2-T6 + 4 thứ 7 × 0.5 = 24.
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

/**
 * Liệt kê các ngày YÊU CẦU NV có mặt ở văn phòng để check-in (dùng tính vắng
 * không phép). Chỉ T2-T6. T7 làm online ở nhà → không cần check-in → không
 * tính là vắng. CN nghỉ.
 *
 * value luôn = 1 (giữ field cho tương thích với snapshot cũ — snapshot trước
 * tháng 5/2026 có thể có dayValue 0.5 cho T7).
 */
export function listWorkingDaysInMonth(year: number, month: number, todayVN?: Date): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = todayVN ?? new Date();
  const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = todayYM === `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = isCurrentMonth ? Math.min(daysInMonth, today.getDate() - 1) : daysInMonth;
  // Chỉ tính ngày đã qua (hôm nay chưa kết thúc, không tính)
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) continue; // CN nghỉ + T7 làm online (không yêu cầu check-in)
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    result.push({ date: dateStr, value: 1 });
  }
  return result;
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
