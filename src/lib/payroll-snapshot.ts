import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePayroll,
  computeParttimePayroll,
  type PayrollResult,
  type ParttimePayrollResult,
} from "@/lib/payroll";
import {
  countWorkdaysInMonth,
  listWorkingDaysInMonth,
  monthRangeVN,
  parseYearMonth,
} from "@/lib/workdays";
import { dateVN } from "@/lib/time";
import { effectiveWorkShifts } from "@/lib/workHours";
import type { Employee, LeaveCategory, LeaveStatus } from "@/types/db";

// Shape lưu trong payroll_snapshots.data jsonb. Đọc lại để render bảng lương
// tháng cũ khi data đã bị cleanup xoá.
export type PayrollSnapshotPayload =
  | { kind: "fulltime"; result: PayrollResult }
  | {
      kind: "parttime";
      result: ParttimePayrollResult;
      workShifts: { start: string; end: string }[];
    };

function monthEndDate(year: number, month: number): string {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}-01`;
}

// Fetch toàn bộ raw data của (NV, tháng) từ DB rồi gọi computePayroll /
// computeParttimePayroll. Logic 1:1 với payroll/page.tsx — nếu thay đổi
// một bên phải sửa cả hai (page giờ chỉ gọi helper này).
export async function computePayrollForMonth(
  admin: SupabaseClient,
  employee: Employee,
  monthStr: string,
): Promise<PayrollSnapshotPayload> {
  const ym = parseYearMonth(monthStr);
  if (!ym) throw new Error(`Invalid year_month: ${monthStr}`);
  const { startIso, endIso } = monthRangeVN(ym.year, ym.month);
  const dayStart = `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
  const dayEnd = monthEndDate(ym.year, ym.month);
  const isParttime = employee.employment_type === "parttime";

  const [
    { data: checkIns },
    { data: violations },
    { data: otRequests },
    { data: leaves },
    { data: excusedAbsences },
    { data: holidays },
  ] = await Promise.all([
    admin
      .from("check_ins")
      .select("id, kind, checked_in_at, late_minutes, early_minutes, offices(name)")
      .eq("employee_id", employee.id)
      .gte("checked_in_at", startIso)
      .lt("checked_in_at", endIso)
      .order("checked_in_at", { ascending: true }),
    admin
      .from("violation_reports")
      .select("id, kind, report_date, total_amount, violation_items(id)")
      .eq("employee_id", employee.id)
      .eq("status", "approved")
      .gte("report_date", dayStart)
      .lt("report_date", dayEnd)
      .order("report_date", { ascending: true }),
    admin
      .from("overtime_requests")
      .select("id, ot_date, start_time, end_time, hours, reason")
      .eq("employee_id", employee.id)
      .eq("status", "approved")
      .gte("ot_date", dayStart)
      .lt("ot_date", dayEnd)
      .order("ot_date", { ascending: true }),
    isParttime
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
      : admin
          .from("leave_requests")
          .select("id, leave_date, category, status, duration, duration_unit, reason, wage_deduction_override, start_time")
          .eq("employee_id", employee.id)
          .eq("status", "approved")
          .gte("leave_date", dayStart)
          .lt("leave_date", dayEnd)
          .order("leave_date", { ascending: true }),
    admin
      .from("excused_absences")
      .select("absence_date")
      .eq("employee_id", employee.id)
      .gte("absence_date", dayStart)
      .lt("absence_date", dayEnd),
    admin
      .from("company_holidays")
      .select("holiday_date")
      .gte("holiday_date", dayStart)
      .lt("holiday_date", dayEnd),
  ]);

  const otInputs = (otRequests ?? []).map((r) => ({
    id: r.id as string,
    ot_date: r.ot_date as string,
    start_time: r.start_time as string,
    end_time: r.end_time as string,
    hours: Number(r.hours ?? 0),
    reason: (r.reason ?? null) as string | null,
  }));

  const excusedDays = new Set<string>();
  for (const lv of leaves ?? []) {
    const cat = (lv as { category?: string }).category;
    const startTime = (lv as { start_time?: string | null }).start_time ?? null;
    if (cat === "leave_paid" || cat === "online_wfh" || cat === "online_rain") {
      // leave_paid nửa ngày (có start_time) → ca còn lại NV phải đi làm, không
      // excuse cả ngày khỏi tính trễ/về sớm. (online_wfh half giữ nguyên hành vi
      // cũ — vẫn excuse, vì NV WFH coi như "đang làm" nửa kia.)
      if (cat === "leave_paid" && startTime) continue;
      excusedDays.add((lv as { leave_date: string }).leave_date);
    }
  }
  // Admin có thể "miễn trừ" 1 ngày vắng không phép (vd NV nghỉ bù, công tác,
  // quên check-in mà không kịp duyệt đơn). Insert vào excused_absences →
  // ngày đó cũng vào excusedDays Set, không bị tính vắng + không trừ lương.
  for (const ea of excusedAbsences ?? []) {
    excusedDays.add((ea as { absence_date: string }).absence_date);
  }
  // Ngày nghỉ chung công ty (lễ/tết/off): áp cho mọi NV, không yêu cầu
  // check-in. Không động vào workdays để tính dayRate → NV vẫn nhận
  // đủ lương full month (giống logic T7 làm online).
  for (const h of holidays ?? []) {
    excusedDays.add((h as { holiday_date: string }).holiday_date);
  }

  const checkInsForCalc = (checkIns ?? []).map((ci) => ({
    id: ci.id as string,
    kind: ((ci.kind ?? "in") as "in" | "out"),
    checked_in_at: ci.checked_in_at as string,
    dateVN: dateVN(ci.checked_in_at as string),
    late_minutes: ci.late_minutes as number | null,
    early_minutes: ci.early_minutes as number | null,
    // @ts-expect-error supabase nested join
    office: (ci.offices?.name ?? null) as string | null,
  }));

  const selfViolationsInput = (violations ?? []).map((v) => ({
    id: v.id as string,
    kind: ((v.kind ?? "violation") as "bonus" | "violation"),
    report_date: v.report_date as string,
    total_amount: Number(v.total_amount),
    item_count: ((v as { violation_items?: unknown[] }).violation_items ?? []).length,
  }));

  if (isParttime) {
    let officeWorkStart = "09:00:00";
    let officeWorkEnd = "18:00:00";
    let officeIsRemote = false;
    if (employee.home_office_id) {
      const { data: office } = await admin
        .from("offices")
        .select("work_start_time, work_end_time, is_remote")
        .eq("id", employee.home_office_id)
        .maybeSingle();
      officeWorkStart = (office?.work_start_time as string | null) ?? "09:00:00";
      officeWorkEnd = (office?.work_end_time as string | null) ?? "18:00:00";
      officeIsRemote = !!(office?.is_remote);
    }
    const workShifts = effectiveWorkShifts(
      {
        email: employee.email,
        work_start_time: employee.work_start_time,
        work_end_time: employee.work_end_time,
        work_shifts: employee.work_shifts ?? null,
      },
      officeWorkStart,
      officeWorkEnd,
    );
    const result = computeParttimePayroll({
      hourlyRate: Number(employee.hourly_rate),
      overtimeRate: Number(employee.overtime_rate),
      workShifts,
      checkIns: checkInsForCalc,
      overtimes: otInputs,
      excusedDays,
      selfViolations: selfViolationsInput,
      isRemote: officeIsRemote,
    });
    return { kind: "parttime", result, workShifts };
  }

  const workdays = countWorkdaysInMonth(ym.year, ym.month);
  const workingDaysInMonth = listWorkingDaysInMonth(ym.year, ym.month);
  const result = computePayroll({
    workdays,
    workingDaysInMonth,
    salary: Number(employee.salary),
    balanceStart: Number(employee.leave_balance),
    approvedLeaves: (leaves ?? []).map((l) => ({
      id: (l as { id: string }).id,
      leave_date: (l as { leave_date: string }).leave_date,
      category: (l as { category: LeaveCategory }).category,
      status: (l as { status: LeaveStatus }).status,
      duration: Number((l as { duration: number }).duration),
      duration_unit: (l as { duration_unit: "day" | "hour" }).duration_unit,
      reason: (l as { reason: string | null }).reason,
      wage_deduction_override: (l as { wage_deduction_override?: number | null }).wage_deduction_override ?? null,
    })),
    checkIns: checkInsForCalc,
    excusedDays,
    selfViolations: selfViolationsInput,
    overtimes: otInputs,
  });
  return { kind: "fulltime", result };
}

// Liệt kê các tháng "YYYY-MM" trong khoảng [startMonth, endMonth) — cả 2
// đều là YYYY-MM, endMonth exclusive.
export function listMonthsBetween(startMonth: string, endMonth: string): string[] {
  const start = parseYearMonth(startMonth);
  const end = parseYearMonth(endMonth);
  if (!start || !end) return [];
  const months: string[] = [];
  let y = start.year;
  let m = start.month;
  while (y < end.year || (y === end.year && m < end.month)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

// Tính tháng "YYYY-MM" đầu tiên có data check_ins trong DB. Dùng để biết
// snapshot cần đi lùi tới đâu. null nếu DB rỗng.
export async function findOldestDataMonth(
  admin: SupabaseClient,
): Promise<string | null> {
  const { data } = await admin
    .from("check_ins")
    .select("checked_in_at")
    .order("checked_in_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.checked_in_at) return null;
  const d = new Date(data.checked_in_at as string);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Trả về tháng đầu tiên (theo VN time) chứa cutoffDate. Vd cutoffDate=2026-01-29
// → "2026-01". Dùng để round cleanup cutoff về biên tháng (data trong tháng
// chứa cutoff sẽ KHÔNG bị xoá để tránh partial-month, đợi tháng sau).
export function monthOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
