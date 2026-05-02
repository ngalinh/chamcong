import type { WorkShift } from "@/types/db";

/**
 * Override giờ làm theo NV.
 *
 * Lưu ở DB:
 *   - employees.work_shifts (jsonb array) — multi-shift, ưu tiên cao nhất
 *   - employees.work_start_time / work_end_time — legacy single-shift
 *   - offices.work_start_time / work_end_time — fallback cuối cùng
 *
 * Admin set qua UI ở /admin/employees.
 */

type EmployeeForShifts = {
  email?: string | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_shifts?: WorkShift[] | null;
};

/**
 * Trả về danh sách shift hiệu lực, sorted by start time asc.
 * Ưu tiên: work_shifts (multi) > work_start/end (single) > office.
 * Luôn trả ít nhất 1 shift.
 */
export function effectiveWorkShifts(
  emp: EmployeeForShifts | null | undefined,
  officeStart: string,
  officeEnd: string,
): WorkShift[] {
  const e = emp ?? {};
  if (e.work_shifts && Array.isArray(e.work_shifts) && e.work_shifts.length > 0) {
    return [...e.work_shifts].sort((a, b) => a.start.localeCompare(b.start));
  }
  if (e.work_start_time && e.work_end_time) {
    return [{ start: e.work_start_time, end: e.work_end_time }];
  }
  return [{ start: officeStart, end: officeEnd }];
}

/**
 * Backward-compat: trả về first shift (start, end). Dùng cho callers chưa
 * support multi-shift. Nếu truyền string → coi như chỉ có email, không override.
 */
export function effectiveWorkHours(
  emp: EmployeeForShifts | string | null | undefined,
  officeStart: string,
  officeEnd: string,
): { start: string; end: string } {
  const e: EmployeeForShifts = typeof emp === "string" ? {} : emp ?? {};
  return effectiveWorkShifts(e, officeStart, officeEnd)[0];
}
