import { formatInTimeZone } from "date-fns-tz";
import { vi } from "date-fns/locale";

/**
 * App-wide timezone. Tất cả chi nhánh ở Việt Nam.
 */
export const APP_TZ = "Asia/Ho_Chi_Minh";

/**
 * Format 1 thời điểm (Date | ISO string) theo giờ Việt Nam.
 * Dùng thay cho `date-fns` format() để đảm bảo không bị lệch sang UTC khi
 * chạy server-side trên Vercel.
 */
export function formatVN(date: Date | string, pattern: string) {
  return formatInTimeZone(new Date(date), APP_TZ, pattern, { locale: vi });
}

/** "HH:MM" tại APP_TZ của thời điểm hiện tại. */
export function currentTimeVN() {
  return formatInTimeZone(new Date(), APP_TZ, "HH:mm");
}

/** "YYYY-MM-DD" (ngày VN) của Date/ISO string. */
export function dateVN(date: Date | string) {
  return formatInTimeZone(new Date(date), APP_TZ, "yyyy-MM-dd");
}

/** Đổi "HH:MM" hoặc "HH:MM:SS" → tổng số phút trong ngày. */
export function timeToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
