/**
 * Override giờ làm theo NV.
 *
 * Thứ tự ưu tiên (cao → thấp):
 *  1. DB columns employees.work_start_time / work_end_time (sửa qua UI admin)
 *  2. Hardcode legacy bên dưới (cho NV cũ, có thể migrate dần qua UI)
 *  3. work_start_time / work_end_time của chi nhánh
 */
const EMPLOYEE_WORK_HOURS_OVERRIDE: Record<string, { start?: string; end?: string }> = {
  // Trâm Trương: ca chiều — giữ làm fallback nếu chưa set qua UI.
  // Sau khi admin set qua UI có thể xoá entry này.
  "trammy.truong@gmail.com": { start: "13:30:00" },
};

type EmployeeForHours = {
  email?: string | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
};

/**
 * Lấy giờ làm hiệu lực của NV theo thứ tự ưu tiên ở docstring trên.
 * Backward-compat: nếu truyền string (email cũ) thay vì object → wrap.
 */
export function effectiveWorkHours(
  emp: EmployeeForHours | string | null | undefined,
  officeStart: string,
  officeEnd: string,
): { start: string; end: string } {
  const e: EmployeeForHours =
    typeof emp === "string" ? { email: emp } : emp ?? {};

  const hardOverride = e.email
    ? EMPLOYEE_WORK_HOURS_OVERRIDE[e.email.toLowerCase()]
    : undefined;

  return {
    start: e.work_start_time ?? hardOverride?.start ?? officeStart,
    end:   e.work_end_time   ?? hardOverride?.end   ?? officeEnd,
  };
}
