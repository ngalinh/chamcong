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
  // Internal flag: skip balance chaining (prevents infinite recursion when
  // computing M-1 to determine M's balanceStart).
  _preventAccrual: boolean = false,
): Promise<PayrollSnapshotPayload> {
  const ym = parseYearMonth(monthStr);
  if (!ym) throw new Error(`Invalid year_month: ${monthStr}`);
  const { startIso, endIso } = monthRangeVN(ym.year, ym.month);
  const dayStart = `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
  const dayEnd = monthEndDate(ym.year, ym.month);
  const isParttime = employee.employment_type === "parttime";
  // Parttime có ca đêm (vd 20:00–00:00): check-out đúng 00:00 đầu tháng sau
  // sẽ bị .lt(endIso) loại ra. Mở rộng thêm 2h để bắt các check-out trễ này.
  const checkInEndIso = isParttime
    ? new Date(new Date(endIso).getTime() + 2 * 3600_000).toISOString()
    : endIso;

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
      .lt("checked_in_at", checkInEndIso)
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
          .select("id, leave_date, category, status, duration, duration_unit, reason, wage_deduction_override, start_time, end_time")
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
      // Nửa ngày (có start_time) → ca còn lại NV vẫn phải chấm công đúng giờ,
      // không excuse cả ngày khỏi tính trễ/về sớm. Mỗi check-in đã được tính
      // late/early đúng theo cửa sổ ca của nó rồi (xem late-early.ts +
      // onlineCheckin.ts) — excuse cả ngày ở đây sẽ xoá luôn vi phạm hợp lệ
      // của ca còn lại (hoặc của chính ca online nếu check-in trễ).
      if (startTime) continue;
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

  // Tính balanceStart cho fulltime:
  //   leave_balance trong DB = balanceStart của tháng last_accrual_month.
  //   A) lastAccrual >= monthStr (tháng đã accrual): tra log accrual tháng đó.
  //      Không dùng phép trừ đơn giản vì NV có thể đã nghỉ phép giữa 2 tháng.
  //   B) _preventAccrual + lastAccrual < monthStr: cộng bù tháng bị skip.
  //   C) lastAccrual = monthStr: dựng lại từ balanceEnd tháng trước. Giá trị
  //      leave_balance có thể đã được chốt bởi một phiên bản công thức cũ.
  //   D) Còn lại: dùng leave_balance trực tiếp hoặc chạy accrual.
  const lastAccrual = employee.last_accrual_month ?? "";
  let balanceStart: number;
  let restoredManualOpeningBalance = false;

  if (!isParttime && lastAccrual >= monthStr) {
    // (A) Xem tháng đã accrual — tra log của đúng tháng đó để lấy balanceStart
    // chính xác, kể cả khi đang xem chính lastAccrual_month.
    // Không tính `leave_balance - n` vì phép nghỉ giữa 2 tháng làm lệch kết quả.
    const { data: logEntry } = await admin
      .from("leave_balance_log")
      .select("balance_after, delta, note")
      .eq("employee_id", employee.id)
      .eq("event_type", "accrual")
      .ilike("note", `%${monthStr}%`)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (logEntry) {
      // Log mở sổ do admin tạo lưu chính số phép nhập tay trong delta. Đây là
      // anchor gốc và không được dựng ngược từ tháng trước không có dữ liệu.
      // Dùng delta cũng tự khôi phục log từng bị bản vá cũ ghi sai balance_after.
      const delta = Number(logEntry.delta);
      // Marker trong note phân biệt chính xác số admin nhập với lần cộng
      // 1 ngày tự động. Giữ kiểm tra delta cho các log admin cũ chưa có marker.
      restoredManualOpeningBalance =
        (logEntry.note?.includes("(admin nhập)") === true || delta !== 1) && delta >= 0;
      balanceStart = restoredManualOpeningBalance ? delta : Number(logEntry.balance_after);
      if (restoredManualOpeningBalance && balanceStart !== Number(logEntry.balance_after)) {
        await admin.from("leave_balance_log")
          .update({ balance_after: balanceStart })
          .eq("employee_id", employee.id)
          .eq("event_type", "accrual")
          .ilike("note", `%${monthStr}%`);
      }
    } else {
      // Không có log cho tháng này (chưa bao giờ accrued riêng) — fallback leave_balance
      balanceStart = Number(employee.leave_balance);
    }
  } else if (!isParttime && _preventAccrual && lastAccrual < monthStr) {
    // (B) _preventAccrual mode nhưng tháng này chưa accrued (bị bỏ qua): cộng bù
    const [ly, lm] = lastAccrual ? lastAccrual.split("-").map(Number) : [0, 0];
    const [my, mm] = monthStr.split("-").map(Number);
    const missedMonths = lastAccrual ? (my - ly) * 12 + (mm - lm) : 1;
    const monthStartIso = new Date(`${monthStr}-01T00:00:00+07:00`).toISOString();
    const canAccrue = new Date().toISOString() >= monthStartIso && employee.created_at < monthStartIso;
    balanceStart = canAccrue
      ? Number(employee.leave_balance) + missedMonths
      : Number(employee.leave_balance);
  } else {
    balanceStart = Number(employee.leave_balance);
  }

  // Cả tháng đang giữ anchor lẫn tháng cũ chưa snapshot đều phải được dựng
  // lại ở request ngoài cùng. Ví dụ đã accrual sang tháng 9 thì khi xem lại
  // tháng 8, lastAccrual > monthStr và log tháng 8 vẫn có thể chứa số cũ.
  // Lời gọi M-1 dùng _preventAccrual để dừng chuỗi tại log lịch sử kế trước.
  const rebuildAccruedMonth = !isParttime && !_preventAccrual && lastAccrual >= monthStr;
  const accrueNewMonth = !isParttime && !_preventAccrual && lastAccrual < monthStr;

  if (rebuildAccruedMonth || accrueNewMonth) {
    const storedBalanceStart = balanceStart;
    const monthStartIso = new Date(`${monthStr}-01T00:00:00+07:00`).toISOString();
    const monthHasStarted = new Date().toISOString() >= monthStartIso;
    const employeeExisted = employee.created_at < monthStartIso;

    // Tính M-1 để lấy balanceEnd làm base
    const prevMonthStr = ym.month === 1
      ? `${ym.year - 1}-12`
      : `${ym.year}-${String(ym.month - 1).padStart(2, "0")}`;

    let prevBalanceEnd: number | null = null;

    // Ưu tiên đọc snapshot của M-1 (nhanh, không cần re-fetch)
    const { data: prevSnap } = await admin
      .from("payroll_snapshots")
      .select("data")
      .eq("employee_id", employee.id)
      .eq("year_month", prevMonthStr)
      .maybeSingle();

    if (!restoredManualOpeningBalance && prevSnap?.data) {
      const p = prevSnap.data as PayrollSnapshotPayload;
      if (p.kind === "fulltime") prevBalanceEnd = p.result.balanceEnd;
    } else if (!restoredManualOpeningBalance) {
      // Chỉ được dựng M-1 khi M-1 có anchor đáng tin cậy. Nếu không có snapshot
      // hoặc log accrual (thường là tháng đầu dùng hệ thống), giữ nguyên anchor
      // của tháng đang xem thay vì lấy leave_balance hiện tại làm lịch sử.
      const { data: prevLog } = await admin
        .from("leave_balance_log")
        .select("id")
        .eq("employee_id", employee.id)
        .eq("event_type", "accrual")
        .ilike("note", `%${prevMonthStr}%`)
        .limit(1)
        .maybeSingle();
      if (prevLog) {
        // Không có snapshot → tính M-1 từ anchor lịch sử (no further recursion).
        const prevPayload = await computePayrollForMonth(admin, employee, prevMonthStr, true);
        if (prevPayload.kind === "fulltime") prevBalanceEnd = prevPayload.result.balanceEnd;
      }
    }

    if (prevBalanceEnd !== null) {
      balanceStart = prevBalanceEnd + (monthHasStarted && employeeExisted ? 1 : 0);
    } else if (accrueNewMonth) {
      // Fallback: không lấy được M-1
      balanceStart = Number(employee.leave_balance) + (monthHasStarted && employeeExisted ? 1 : 0);
    }

    // Chỉ tạo log mới khi tháng chưa được cộng phép.
    if (accrueNewMonth && monthHasStarted && employeeExisted) {
      await admin.from("employees").update({
        leave_balance: balanceStart,
        last_accrual_month: monthStr,
      }).eq("id", employee.id);
      await admin.from("leave_balance_log").insert({
        employee_id: employee.id,
        delta: 1,
        balance_after: balanceStart,
        event_type: "accrual",
        note: `Cộng phép tháng ${monthStr} (tự động)`,
      });
    } else if (rebuildAccruedMonth && prevBalanceEnd !== null && balanceStart !== storedBalanceStart) {
      // Sửa anchor/log đã được tính bởi công thức cũ. Nhờ vậy tháng hiện tại
      // và các tháng sau cùng nối tiếp từ một số dư cuối kỳ chính xác.
      const corrections = [
        admin.from("leave_balance_log")
          .update({ balance_after: balanceStart })
          .eq("employee_id", employee.id)
          .eq("event_type", "accrual")
          .ilike("note", `%${monthStr}%`),
      ];
      // employees.leave_balance là anchor của lastAccrual; không được ghi số
      // tháng cũ vào đây khi người dùng chỉ đang xem lại lịch sử.
      if (lastAccrual === monthStr) {
        corrections.push(
          admin.from("employees").update({ leave_balance: balanceStart }).eq("id", employee.id),
        );
      }
      await Promise.all(corrections);
    }
  }

  const workdays = countWorkdaysInMonth(ym.year, ym.month);
  const workingDaysInMonth = listWorkingDaysInMonth(ym.year, ym.month);
  const effectiveSalary =
    employee.salary_pending_month && employee.salary_pending_month <= monthStr
      ? Number(employee.salary_pending ?? 0)
      : Number(employee.salary);
  const result = computePayroll({
    workdays,
    workingDaysInMonth,
    month: monthStr,
    salary: effectiveSalary,
    balanceStart,
    approvedLeaves: (leaves ?? []).map((l) => ({
      id: (l as { id: string }).id,
      leave_date: (l as { leave_date: string }).leave_date,
      category: (l as { category: LeaveCategory }).category,
      status: (l as { status: LeaveStatus }).status,
      duration: Number((l as { duration: number }).duration),
      duration_unit: (l as { duration_unit: "day" | "hour" }).duration_unit,
      start_time: (l as { start_time?: string | null }).start_time ?? null,
      end_time: (l as { end_time?: string | null }).end_time ?? null,
      reason: (l as { reason: string | null }).reason,
      wage_deduction_override: (l as { wage_deduction_override?: number | null }).wage_deduction_override ?? null,
    })),
    checkIns: checkInsForCalc,
    excusedDays,
    selfViolations: selfViolationsInput,
    overtimes: otInputs,
    exemptAbsence: !!(employee as { exempt_absence?: boolean }).exempt_absence,
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
