/**
 * Override giờ làm riêng cho vài nhân viên đặc biệt — không muốn bày lên UI.
 * Key = email (lowercase). Field nào undefined → dùng của office.
 *
 * Thêm / xoá override ở đây, không cần migration.
 */
const EMPLOYEE_WORK_HOURS_OVERRIDE: Record<string, { start?: string; end?: string }> = {
  // Trâm Trương: ca chiều, bắt đầu 13:30, kết thúc theo VP Sài Gòn
  "trammy.truong@gmail.com": { start: "13:30:00" },
};

/**
 * Lấy giờ làm hiệu lực của NV theo office + override riêng (nếu có).
 * Không dịch theo đơn nghỉ theo giờ — phần đó xử lý ở tầng caller.
 */
export function effectiveWorkHours(
  email: string | null | undefined,
  officeStart: string,
  officeEnd: string,
): { start: string; end: string } {
  const override = email ? EMPLOYEE_WORK_HOURS_OVERRIDE[email.toLowerCase()] : undefined;
  return {
    start: override?.start ?? officeStart,
    end:   override?.end   ?? officeEnd,
  };
}
