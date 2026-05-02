import type { LeaveCategory, LeaveStatus, WorkShift } from "@/types/db";
import { dateVN, formatVN, timeToMinutes } from "@/lib/time";

const LATE_PENALTY_FREE = 3;          // 3 lần đầu không phạt
const LATE_PENALTY_AMOUNT = 50_000;   // VND/lần từ lần thứ 4
const ONLINE_WFH_FREE_DAYS = 3;       // 3 ngày online_wfh đầu/tháng miễn phí
const ONLINE_WFH_PHEP_RATIO = 0.5;    // 1 ngày online vượt = 0.5 phép
const HOURS_PER_WORKDAY = 8;

export type PayrollLeaveItem = {
  id: string;
  date: string;             // YYYY-MM-DD
  category: LeaveCategory;
  status: LeaveStatus;
  durationDays: number;     // luôn quy đổi ra ngày
  durationHours: number;    // hoặc giờ (chỉ dùng cho leave_hourly)
  durationLabel: string;    // hiển thị vd "1 ngày" / "2 giờ"
  reason: string | null;
  // Phân tách
  phepUsed: number;         // ngày phép trừ
  wageDays: number;         // ngày bị trừ lương (phần thập phân OK)
  wageHours: number;        // giờ bị trừ lương (chỉ leave_hourly)
  freeDays: number;         // ngày miễn phí (online_rain hoặc 3 ngày đầu online_wfh)
  wageDeduction: number;    // VND trừ lương cho item này
  label: "free" | "phep" | "wage" | "phep_wage";
};

export type PayrollViolation = {
  id: string;
  at: string;
  kind: "late" | "early";
  minutes: number;
  office: string | null;
  countedForPenalty: boolean; // true nếu là lần >3 → bị phạt 50k
};

export type SelfViolationItem = {
  id: string;
  reportDate: string;
  totalAmount: number;
  itemCount: number;
};

export type SelfBonusItem = {
  id: string;
  reportDate: string;
  totalAmount: number;
  itemCount: number;
};

export type OvertimeEntry = {
  id: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM:SS
  endTime: string;
  hours: number;
  reason: string | null;
  pay: number;         // VND
};

export type PayrollResult = {
  salary: number;
  workdays: number;
  dayRate: number;
  hourRate: number;
  balanceStart: number;
  balanceEnd: number;
  leaves: PayrollLeaveItem[];
  lateEarlyViolations: PayrollViolation[];
  selfViolations: SelfViolationItem[];
  selfBonuses: SelfBonusItem[];
  overtimes: OvertimeEntry[];      // chi tiết từng đơn OT
  // Tổng các loại
  totalLatePenalty: number;
  totalSelfViolation: number;
  totalSelfBonus: number;
  totalOTPay: number;              // OT pay cộng vào lương
  totalWageDeduction: number;
  grandTotal: number;              // tổng tiền bị TRỪ (chưa cộng bonus + OT)
};

type LeaveInput = {
  id: string;
  leave_date: string;
  category: LeaveCategory;
  status: LeaveStatus;
  duration: number;
  duration_unit: "day" | "hour";
  reason: string | null;
};

type CheckInInput = {
  id: string;
  kind: "in" | "out";
  checked_in_at: string;
  dateVN: string;            // "YYYY-MM-DD" theo giờ VN
  late_minutes: number | null;
  early_minutes: number | null;
  office: string | null;
};

type SelfViolationInput = {
  id: string;
  kind: "bonus" | "violation";
  report_date: string;
  total_amount: number;
  item_count: number;
};

type OvertimeInput = {
  id: string;
  ot_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string | null;
};

export function computePayroll(args: {
  workdays: number;
  salary: number;
  balanceStart: number;
  approvedLeaves: LeaveInput[];   // sorted by leave_date asc
  checkIns: CheckInInput[];        // tất cả check-ins trong tháng
  excusedDays: Set<string>;        // các ngày YYYY-MM-DD có leave_paid/online_* approved → không tính vi phạm late/early
  selfViolations: SelfViolationInput[]; // approved violation_reports (cả bonus + violation)
  overtimes: OvertimeInput[];      // approved overtime_requests trong tháng
}): PayrollResult {
  const { workdays, salary, balanceStart, approvedLeaves, checkIns, excusedDays, selfViolations, overtimes } = args;
  const dayRate = workdays > 0 ? salary / workdays : 0;
  const hourRate = dayRate / HOURS_PER_WORKDAY;

  let balance = balanceStart;
  let onlineWfhUsed = 0;
  const leaves: PayrollLeaveItem[] = [];
  let totalWageDeduction = 0;

  // Sort theo leave_date asc để cumulative count online_wfh đúng thứ tự
  const sorted = [...approvedLeaves].sort((a, b) => a.leave_date.localeCompare(b.leave_date));

  for (const lv of sorted) {
    const days = lv.duration_unit === "day" ? lv.duration : lv.duration / HOURS_PER_WORKDAY;
    const hours = lv.duration_unit === "hour" ? lv.duration : lv.duration * HOURS_PER_WORKDAY;
    const durationLabel = lv.duration_unit === "day"
      ? `${formatNum(lv.duration)} ngày`
      : `${formatNum(lv.duration)} giờ`;

    let phepUsed = 0;
    let wageDays = 0;
    let wageHours = 0;
    let freeDays = 0;
    let wageDeduction = 0;
    let label: PayrollLeaveItem["label"] = "free";

    if (lv.category === "online_rain") {
      // Luôn miễn phí
      freeDays = days;
      label = "free";
    } else if (lv.category === "online_wfh") {
      // 3 ngày đầu free, sau đó 0.5 phép/ngày, hết phép → 0.5 dayRate/ngày
      const freeCap = Math.max(0, ONLINE_WFH_FREE_DAYS - onlineWfhUsed);
      const usedFree = Math.min(days, freeCap);
      const billable = days - usedFree;
      onlineWfhUsed += days;
      freeDays = usedFree;

      const phepNeeded = billable * ONLINE_WFH_PHEP_RATIO;
      const phepConsumed = Math.min(balance, phepNeeded);
      const phepShort = phepNeeded - phepConsumed;
      balance -= phepConsumed;
      phepUsed = phepConsumed;
      // 1 ngày online vượt phép = 0.5 dayRate trừ lương
      // → phép thiếu phepShort tương ứng billable thiếu = phepShort / 0.5 ngày
      // → trừ lương = (phepShort / 0.5) × 0.5 × dayRate = phepShort × dayRate
      wageDays = phepShort * 2; // ngày billable bị trừ lương
      wageDeduction = phepShort * dayRate;

      if (billable === 0) label = "free";
      else if (phepShort === 0) label = "phep";
      else if (phepConsumed === 0) label = "wage";
      else label = "phep_wage";
    } else if (lv.category === "leave_paid") {
      // 1 ngày leave_paid = 1 phép. Hết phép → trừ lương theo dayRate
      const phepConsumed = Math.min(balance, days);
      const phepShort = days - phepConsumed;
      balance -= phepConsumed;
      phepUsed = phepConsumed;
      wageDays = phepShort;
      wageDeduction = phepShort * dayRate;

      if (phepShort === 0) label = "phep";
      else if (phepConsumed === 0) label = "wage";
      else label = "phep_wage";
    } else if (lv.category === "leave_hourly") {
      // Không trừ phép, chỉ trừ lương theo giờ
      wageHours = hours;
      wageDeduction = hours * hourRate;
      label = "wage";
    } else {
      // online_paid / leave_unpaid (deprecated) — fallback: chỉ hiển thị, không trừ
      label = "free";
    }

    totalWageDeduction += wageDeduction;
    leaves.push({
      id: lv.id,
      date: lv.leave_date,
      category: lv.category,
      status: lv.status,
      durationDays: days,
      durationHours: hours,
      durationLabel,
      reason: lv.reason,
      phepUsed,
      wageDays,
      wageHours,
      freeDays,
      wageDeduction,
      label,
    });
  }

  // Late/early violations
  const allLateEarly: PayrollViolation[] = [];
  for (const ci of checkIns) {
    if (excusedDays.has(ci.dateVN)) continue;
    const isLate = ci.kind === "in" && (ci.late_minutes ?? 0) > 5;
    const isEarly = ci.kind === "out" && (ci.early_minutes ?? 0) > 5;
    if (!isLate && !isEarly) continue;
    allLateEarly.push({
      id: ci.id,
      at: ci.checked_in_at,
      kind: isLate ? "late" : "early",
      minutes: isLate ? (ci.late_minutes ?? 0) : (ci.early_minutes ?? 0),
      office: ci.office,
      countedForPenalty: false, // sẽ set sau khi sort
    });
  }
  // Sort theo thời gian — 3 lần đầu free, từ lần thứ 4 phạt
  allLateEarly.sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 0; i < allLateEarly.length; i++) {
    if (i >= LATE_PENALTY_FREE) allLateEarly[i].countedForPenalty = true;
  }
  const totalLatePenalty = allLateEarly.filter((v) => v.countedForPenalty).length * LATE_PENALTY_AMOUNT;

  // Tách self-reported entries: bonus (cộng) vs violation (trừ)
  const selfVList: SelfViolationItem[] = [];
  const selfBList: SelfBonusItem[] = [];
  for (const v of selfViolations) {
    const item = {
      id: v.id,
      reportDate: v.report_date,
      totalAmount: Number(v.total_amount),
      itemCount: v.item_count,
    };
    if (v.kind === "bonus") selfBList.push(item);
    else selfVList.push(item);
  }
  const totalSelfViolation = selfVList.reduce((s, v) => s + v.totalAmount, 0);
  const totalSelfBonus     = selfBList.reduce((s, v) => s + v.totalAmount, 0);

  // OT pay: 1 giờ OT = lương/giờ (= salary / workdays / 8) — fulltime không có
  // overtime_rate riêng, dùng hourRate thuần.
  const otEntries: OvertimeEntry[] = overtimes.map((o) => ({
    id: o.id,
    date: o.ot_date,
    startTime: o.start_time,
    endTime: o.end_time,
    hours: Number(o.hours),
    reason: o.reason,
    pay: Number(o.hours) * hourRate,
  }));
  const totalOTPay = otEntries.reduce((s, o) => s + o.pay, 0);

  return {
    salary,
    workdays,
    dayRate,
    hourRate,
    balanceStart,
    balanceEnd: balance,
    leaves,
    lateEarlyViolations: allLateEarly,
    selfViolations: selfVList,
    selfBonuses: selfBList,
    overtimes: otEntries,
    totalLatePenalty,
    totalSelfViolation,
    totalOTPay,
    totalSelfBonus,
    totalWageDeduction,
    grandTotal: totalLatePenalty + totalSelfViolation + totalWageDeduction,
  };
}

// ====================================================================
// PARTTIME — lương theo giờ
// ====================================================================

export type ParttimeShift = {
  date: string;          // YYYY-MM-DD theo giờ VN của check-in
  startAt: string;       // ISO
  endAt: string | null;  // ISO, null = chưa check-out (shift dở)
  hours: number;         // giờ thực dùng để tính lương — đã cap vào work window
  actualHours: number;   // giờ thực tế từ check-in tới check-out
};

export type ParttimePayrollResult = {
  hourlyRate: number;
  overtimeRate: number;
  shifts: ParttimeShift[];
  workedHours: number;
  basePay: number;
  approvedOTHours: number;
  otPay: number;
  overtimes: OvertimeEntry[];
  lateEarlyViolations: PayrollViolation[];
  totalLatePenalty: number;
  selfViolations: SelfViolationItem[];
  selfBonuses: SelfBonusItem[];
  totalSelfViolation: number;
  totalSelfBonus: number;
  grandDeduction: number;
  grandEarning: number;
};

export function computeParttimePayroll(args: {
  hourlyRate: number;
  overtimeRate: number;
  workShifts: WorkShift[];
  checkIns: CheckInInput[];
  overtimes: OvertimeInput[];
  excusedDays: Set<string>;
  selfViolations: SelfViolationInput[];
}): ParttimePayrollResult {
  const { hourlyRate, overtimeRate, workShifts, checkIns, overtimes, excusedDays, selfViolations } = args;
  // Parttime: nếu overtime_rate > 0 → dùng nó; else fallback hourly_rate.
  const effOTRate = overtimeRate > 0 ? overtimeRate : hourlyRate;
  const otEntries: OvertimeEntry[] = overtimes.map((o) => ({
    id: o.id,
    date: o.ot_date,
    startTime: o.start_time,
    endTime: o.end_time,
    hours: Number(o.hours),
    reason: o.reason,
    pay: Number(o.hours) * effOTRate,
  }));
  const approvedOTHours = otEntries.reduce((s, o) => s + o.hours, 0);
  const otPay = otEntries.reduce((s, o) => s + o.pay, 0);

  // Sort 1 lần để dùng cho cả late/early detection và shift pairing
  const sorted = [...checkIns].sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at));

  // Late/early violations — compute trước để biết check-in nào nằm trong 3 lần
  // miễn phí (forgiven) vs lần thứ 4+ (counted for penalty).
  const allLateEarly: PayrollViolation[] = [];
  for (const ci of sorted) {
    if (excusedDays.has(ci.dateVN)) continue;
    const isLate = ci.kind === "in" && (ci.late_minutes ?? 0) > 5;
    const isEarly = ci.kind === "out" && (ci.early_minutes ?? 0) > 5;
    if (!isLate && !isEarly) continue;
    allLateEarly.push({
      id: ci.id,
      at: ci.checked_in_at,
      kind: isLate ? "late" : "early",
      minutes: isLate ? (ci.late_minutes ?? 0) : (ci.early_minutes ?? 0),
      office: ci.office,
      countedForPenalty: false,
    });
  }
  // allLateEarly đã sorted vì sorted đã sorted
  for (let i = 0; i < allLateEarly.length; i++) {
    if (i >= LATE_PENALTY_FREE) allLateEarly[i].countedForPenalty = true;
  }
  const totalLatePenalty = allLateEarly.filter((v) => v.countedForPenalty).length * LATE_PENALTY_AMOUNT;

  // penaltyMap: id check-in → đã bị tính phạt chưa (true = lần 4+, false = miễn phí)
  const penaltyMap = new Map<string, boolean>();
  for (const v of allLateEarly) {
    penaltyMap.set(v.id, v.countedForPenalty);
  }

  // Pair in+out → shifts (apply forgiveness cho late check-in trong 3 lần đầu)
  const shifts: ParttimeShift[] = [];
  let pendingIn: CheckInInput | null = null;
  let pendingInForgiven = false;
  for (const ci of sorted) {
    if (ci.kind === "in") {
      if (pendingIn) {
        shifts.push({ date: pendingIn.dateVN, startAt: pendingIn.checked_in_at, endAt: null, hours: 0, actualHours: 0 });
      }
      pendingIn = ci;
      // Late + chưa bị tính phạt (trong 3 lần đầu HOẶC excused) → forgiven cho hours
      const isLate = (ci.late_minutes ?? 0) > 5;
      pendingInForgiven = isLate && penaltyMap.get(ci.id) !== true;
    } else if (ci.kind === "out") {
      if (pendingIn) {
        const ms = new Date(ci.checked_in_at).getTime() - new Date(pendingIn.checked_in_at).getTime();
        const actualHours = Math.max(0, ms / 3600_000);
        const sane = actualHours > 18 ? 0 : actualHours;
        // Tìm work shift gần nhất với check-in time (dùng start time để match)
        const ws = closestWorkShiftForCheckIn(workShifts, pendingIn.checked_in_at);
        const regularHours = sane > 0 && ws
          ? regularHoursOfShift(pendingIn.checked_in_at, ci.checked_in_at, ws.start, ws.end, { forgivenLateStart: pendingInForgiven })
          : 0;
        shifts.push({
          date: pendingIn.dateVN,
          startAt: pendingIn.checked_in_at,
          endAt: ci.checked_in_at,
          hours: regularHours,
          actualHours: sane,
        });
        pendingIn = null;
        pendingInForgiven = false;
      }
    }
  }
  if (pendingIn) {
    shifts.push({ date: pendingIn.dateVN, startAt: pendingIn.checked_in_at, endAt: null, hours: 0, actualHours: 0 });
  }

  const workedHours = shifts.reduce((s, sh) => s + sh.hours, 0);
  const basePay = workedHours * hourlyRate;

  // Bonus / Violation
  const selfVList: SelfViolationItem[] = [];
  const selfBList: SelfBonusItem[] = [];
  for (const v of selfViolations) {
    const item = {
      id: v.id,
      reportDate: v.report_date,
      totalAmount: Number(v.total_amount),
      itemCount: v.item_count,
    };
    if (v.kind === "bonus") selfBList.push(item);
    else selfVList.push(item);
  }
  const totalSelfViolation = selfVList.reduce((s, v) => s + v.totalAmount, 0);
  const totalSelfBonus = selfBList.reduce((s, v) => s + v.totalAmount, 0);

  const grandDeduction = totalLatePenalty + totalSelfViolation;
  const grandEarning = basePay + otPay - grandDeduction + totalSelfBonus;

  return {
    hourlyRate,
    overtimeRate,
    shifts,
    workedHours,
    basePay,
    approvedOTHours,
    otPay,
    overtimes: otEntries,
    lateEarlyViolations: allLateEarly,
    totalLatePenalty,
    selfViolations: selfVList,
    selfBonuses: selfBList,
    totalSelfViolation,
    totalSelfBonus,
    grandDeduction,
    grandEarning,
  };
}

/**
 * Tính số giờ overlap của 1 shift với cửa sổ giờ làm chính thức.
 * Hỗ trợ ca xuyên đêm (workEnd < workStart hoặc workEnd = "00:00:00").
 *
 * Vd NV ca 20:00-00:00:
 *   - shift 20:11 → 02:00 (cross midnight) → overlap với [20:00, 00:00 next] = 3h49m
 *   - shift 20:00 → 23:50 → overlap = 3h50m (full)
 *
 * Vd NV ca 21:00-06:00:
 *   - shift 21:00 day1 → 06:00 day2 → overlap = 9h (full)
 *   - shift 21:00 day1 → 07:00 day2 (1h OT) → overlap = 9h (cap tại 06:00)
 */
/** Tìm work shift có start time gần nhất với check-in (theo phút trong ngày VN). */
function closestWorkShiftForCheckIn(shifts: WorkShift[], checkInIso: string): WorkShift | null {
  if (shifts.length === 0) return null;
  if (shifts.length === 1) return shifts[0];
  const ciTimeStr = formatVN(checkInIso, "HH:mm:ss");
  const ciMin = timeToMinutes(ciTimeStr);
  return shifts.reduce<WorkShift | null>((best, s) => {
    const distance = Math.abs(ciMin - timeToMinutes(s.start));
    if (!best) return s;
    return distance < Math.abs(ciMin - timeToMinutes(best.start)) ? s : best;
  }, null);
}

function regularHoursOfShift(
  startAtIso: string,
  endAtIso: string,
  workStartHM: string,
  workEndHM: string,
  opts: { forgivenLateStart?: boolean } = {},
): number {
  const startDateVN = dateVN(startAtIso);
  const startMin = timeToMinutes(workStartHM);
  const endMin = timeToMinutes(workEndHM);
  const isNightShift = endMin <= startMin;

  const ws = workStartHM.length >= 8 ? workStartHM : `${workStartHM}:00`;
  const we = workEndHM.length >= 8 ? workEndHM : `${workEndHM}:00`;
  const regStartMs = new Date(`${startDateVN}T${ws}+07:00`).getTime();
  let regEndMs: number;
  if (isNightShift) {
    const next = addDaysVN(startDateVN, 1);
    if (endMin === 0) {
      regEndMs = new Date(`${next}T00:00:00+07:00`).getTime();
    } else {
      regEndMs = new Date(`${next}T${we}+07:00`).getTime();
    }
  } else {
    regEndMs = new Date(`${startDateVN}T${we}+07:00`).getTime();
  }

  const shiftStartMs = new Date(startAtIso).getTime();
  const shiftEndMs = new Date(endAtIso).getTime();
  // Forgiven late: bỏ qua thời điểm check-in muộn, tính từ workStart như chưa muộn
  const overlapStart = opts.forgivenLateStart ? regStartMs : Math.max(regStartMs, shiftStartMs);
  const overlapEnd = Math.min(regEndMs, shiftEndMs);
  return Math.max(0, (overlapEnd - overlapStart) / 3600_000);
}

function addDaysVN(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  return formatVN(new Date(d.getTime() + days * 86400_000), "yyyy-MM-dd");
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
