import type { LeaveCategory, LeaveStatus } from "@/types/db";

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
  // Tổng các loại trừ
  totalLatePenalty: number;
  totalSelfViolation: number;
  totalWageDeduction: number;  // từ leaves vượt phép + leave_hourly + online vượt hết phép
  grandTotal: number;          // toàn bộ tiền bị trừ
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
  report_date: string;
  total_amount: number;
  item_count: number;
};

export function computePayroll(args: {
  workdays: number;
  salary: number;
  balanceStart: number;
  approvedLeaves: LeaveInput[];   // sorted by leave_date asc
  checkIns: CheckInInput[];        // tất cả check-ins trong tháng
  excusedDays: Set<string>;        // các ngày YYYY-MM-DD có leave_paid/online_* approved → không tính vi phạm late/early
  selfViolations: SelfViolationInput[]; // approved violation_reports
}): PayrollResult {
  const { workdays, salary, balanceStart, approvedLeaves, checkIns, excusedDays, selfViolations } = args;
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

  // Self violations
  const selfVList: SelfViolationItem[] = selfViolations.map((v) => ({
    id: v.id,
    reportDate: v.report_date,
    totalAmount: Number(v.total_amount),
    itemCount: v.item_count,
  }));
  const totalSelfViolation = selfVList.reduce((s, v) => s + v.totalAmount, 0);

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
    totalLatePenalty,
    totalSelfViolation,
    totalWageDeduction,
    grandTotal: totalLatePenalty + totalSelfViolation + totalWageDeduction,
  };
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
