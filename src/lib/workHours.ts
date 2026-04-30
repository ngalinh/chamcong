/**
 * Override giờ làm theo NV.
 *
 * Lưu ở DB (employees.work_start_time / employees.work_end_time).
 * Admin set qua UI ở /admin/employees.
 *
 * Thứ tự ưu tiên (cao → thấp):
 *  1. DB columns employees.work_start_time / work_end_time
 *  2. work_start_time / work_end_time của chi nhánh (employees.home_office_id → offices)
 */

type EmployeeForHours = {
  email?: string | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
};

/**
 * Backward-compat: nếu truyền string (email cũ) thay vì object → wrap, không dùng email
 * cho lookup nữa (đã chuyển sang DB).
 */
export function effectiveWorkHours(
  emp: EmployeeForHours | string | null | undefined,
  officeStart: string,
  officeEnd: string,
): { start: string; end: string } {
  const e: EmployeeForHours =
    typeof emp === "string" ? {} : emp ?? {};

  return {
    start: e.work_start_time ?? officeStart,
    end:   e.work_end_time   ?? officeEnd,
  };
}
