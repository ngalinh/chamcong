import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { LEAVE_CATEGORIES, type Employee, type LeaveCategory, type LeaveStatus } from "@/types/db";
import { computePayroll } from "@/lib/payroll";
import { countWorkdaysInMonth, monthRangeVN, parseYearMonth, yearMonthVN } from "@/lib/workdays";
import { dateVN, formatVN } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  Wallet,
  CalendarOff,
  Hourglass,
  Wifi,
  ShieldAlert,
  Clock,
  AlertTriangle,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

const fmtVnd = (n: number) => `${Math.round(n).toLocaleString("en-US")} VND`;

export default async function PayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) redirect("/");

  const monthStr = sp.month && parseYearMonth(sp.month) ? sp.month : yearMonthVN();
  const ym = parseYearMonth(monthStr)!;
  const { startIso, endIso } = monthRangeVN(ym.year, ym.month);

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle<Employee>();
  if (!emp) notFound();

  const [{ data: leaves }, { data: checkIns }, { data: violations }] = await Promise.all([
    admin
      .from("leave_requests")
      .select("id, leave_date, category, status, duration, duration_unit, reason")
      .eq("employee_id", emp.id)
      .eq("status", "approved")
      .gte("leave_date", `${ym.year}-${String(ym.month).padStart(2, "0")}-01`)
      .lt("leave_date", monthEndDate(ym.year, ym.month))
      .order("leave_date", { ascending: true }),
    admin
      .from("check_ins")
      .select("id, kind, checked_in_at, late_minutes, early_minutes, offices(name)")
      .eq("employee_id", emp.id)
      .gte("checked_in_at", startIso)
      .lt("checked_in_at", endIso)
      .order("checked_in_at", { ascending: true }),
    admin
      .from("violation_reports")
      .select("id, report_date, total_amount, violation_items(id)")
      .eq("employee_id", emp.id)
      .eq("status", "approved")
      .gte("report_date", `${ym.year}-${String(ym.month).padStart(2, "0")}-01`)
      .lt("report_date", monthEndDate(ym.year, ym.month))
      .order("report_date", { ascending: true }),
  ]);

  const workdays = countWorkdaysInMonth(ym.year, ym.month);

  // excused days = ngày NV không có mặt ở văn phòng (leave_paid / online_*)
  const excusedDays = new Set<string>();
  for (const lv of leaves ?? []) {
    if (
      lv.category === "leave_paid" ||
      lv.category === "online_wfh" ||
      lv.category === "online_rain"
    ) {
      excusedDays.add(lv.leave_date);
    }
  }

  const checkInsForCalc = (checkIns ?? []).map((ci) => ({
    id: ci.id,
    kind: (ci.kind ?? "in") as "in" | "out",
    checked_in_at: ci.checked_in_at as string,
    dateVN: dateVN(ci.checked_in_at as string),
    late_minutes: ci.late_minutes,
    early_minutes: ci.early_minutes,
    // @ts-expect-error — supabase nested join
    office: ci.offices?.name ?? null,
  }));

  const result = computePayroll({
    workdays,
    salary: Number(emp.salary),
    balanceStart: Number(emp.leave_balance),
    approvedLeaves: (leaves ?? []).map((l) => ({
      id: l.id,
      leave_date: l.leave_date,
      category: l.category as LeaveCategory,
      status: l.status as LeaveStatus,
      duration: Number(l.duration),
      duration_unit: l.duration_unit as "day" | "hour",
      reason: l.reason,
    })),
    checkIns: checkInsForCalc,
    excusedDays,
    selfViolations: (violations ?? []).map((v) => ({
      id: v.id,
      report_date: v.report_date,
      total_amount: Number(v.total_amount),
      item_count: ((v as { violation_items?: unknown[] }).violation_items ?? []).length,
    })),
  });

  // Group leaves theo loại để hiển thị mục riêng
  const leavesByCat: Record<string, typeof result.leaves> = {};
  for (const lv of result.leaves) {
    const k = lv.category;
    leavesByCat[k] ??= [];
    leavesByCat[k].push(lv);
  }

  // Prev/next month link
  const prev = ym.month === 1 ? { y: ym.year - 1, m: 12 } : { y: ym.year, m: ym.month - 1 };
  const next = ym.month === 12 ? { y: ym.year + 1, m: 1 } : { y: ym.year, m: ym.month + 1 };
  const prevHref = `/admin/employees/${id}/payroll?month=${prev.y}-${String(prev.m).padStart(2, "0")}`;
  const nextHref = `/admin/employees/${id}/payroll?month=${next.y}-${String(next.m).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/employees"
          className="h-9 w-9 rounded-full hover:bg-white/50 flex items-center justify-center text-neutral-600"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">Bảng lương</p>
          <h1 className="text-2xl font-semibold tracking-tight">{emp.name}</h1>
          <p className="text-xs text-neutral-500">{emp.email}</p>
        </div>
      </div>

      {/* Month picker */}
      <div className="flex items-center justify-between rounded-xl border border-white/60 glass p-2">
        <Link href={prevHref} className="h-9 w-9 rounded-lg hover:bg-white/70 flex items-center justify-center text-neutral-600">
          <ChevronLeft size={18} />
        </Link>
        <form action={`/admin/employees/${id}/payroll`} className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={monthStr}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
          />
          <button type="submit" className="h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm font-medium hover:bg-neutral-50">
            Xem
          </button>
        </form>
        <Link href={nextHref} className="h-9 w-9 rounded-lg hover:bg-white/70 flex items-center justify-center text-neutral-600">
          <ChevronRight size={18} />
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <SummaryCard icon={Calendar}    label="Ngày làm việc"    value={`${formatNum(result.workdays)} ngày`}             tone="sky" />
        <SummaryCard icon={Wallet}      label="Lương / ngày"      value={fmtVnd(result.dayRate)}                            tone="indigo" />
        <SummaryCard icon={CalendarOff} label="Phép đầu kỳ"       value={`${formatNum(result.balanceStart)} ngày`}          tone="amber" />
        <SummaryCard icon={CalendarOff} label="Phép cuối kỳ"       value={`${formatNum(result.balanceEnd)} ngày`}            tone={result.balanceEnd < 0 ? "rose" : "emerald"} />
      </div>

      {result.salary === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            Lương cứng của NV này đang là <b>0 VND</b>. Mọi tính toán trừ lương sẽ ra 0. Vào trang
            <Link href="/admin/employees" className="underline mx-1">Nhân viên</Link>
            để cập nhật lương.
          </div>
        </div>
      )}

      {/* Đi muộn / Về sớm */}
      <Section
        icon={Clock}
        title="Đi muộn / Về sớm"
        subtitle={`${result.lateEarlyViolations.length} lần · ${result.lateEarlyViolations.filter((v) => v.countedForPenalty).length} lần phạt 50k`}
        empty="Không có vi phạm đi muộn / về sớm."
      >
        {result.lateEarlyViolations.length > 0 && (
          <ul className="divide-y divide-neutral-200/60">
            {result.lateEarlyViolations.map((v, idx) => (
              <li key={v.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="text-xs font-mono text-neutral-400 tabular-nums w-8">#{idx + 1}</span>
                <span className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
                  v.kind === "late" ? "bg-amber-50 text-amber-700" : "bg-orange-50 text-orange-700",
                )}>
                  {v.kind === "late" ? "Muộn" : "Về sớm"}
                </span>
                <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(v.at, "dd/MM HH:mm")}</span>
                <span className="text-xs text-neutral-500 truncate flex-1">{v.office ?? "—"} · {v.minutes}p</span>
                {v.countedForPenalty ? (
                  <span className="text-rose-700 font-semibold tabular-nums shrink-0">−50,000</span>
                ) : (
                  <span className="text-xs text-neutral-400 shrink-0">Miễn phí (≤3)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Xin nghỉ ngày */}
      <Section
        icon={CalendarOff}
        title="Nghỉ theo ngày"
        subtitle={`${(leavesByCat.leave_paid ?? []).length} đơn`}
        empty="Không có đơn nghỉ theo ngày."
      >
        {leavesByCat.leave_paid && (
          <LeaveList items={leavesByCat.leave_paid} />
        )}
      </Section>

      {/* Nghỉ theo giờ */}
      <Section
        icon={Hourglass}
        title="Nghỉ theo giờ"
        subtitle={`${(leavesByCat.leave_hourly ?? []).length} đơn`}
        empty="Không có đơn nghỉ theo giờ."
      >
        {leavesByCat.leave_hourly && (
          <LeaveList items={leavesByCat.leave_hourly} />
        )}
      </Section>

      {/* Online */}
      <Section
        icon={Wifi}
        title="Làm online"
        subtitle={`${[...(leavesByCat.online_wfh ?? []), ...(leavesByCat.online_rain ?? [])].length} đơn · ${ONLINE_WFH_FREE_DAYS} ngày WFH đầu free`}
        empty="Không có đơn làm online."
      >
        {(leavesByCat.online_wfh || leavesByCat.online_rain) && (
          <LeaveList items={[...(leavesByCat.online_wfh ?? []), ...(leavesByCat.online_rain ?? [])].sort((a, b) => a.date.localeCompare(b.date))} />
        )}
      </Section>

      {/* Vi phạm tự khai */}
      <Section
        icon={ShieldAlert}
        title="Vi phạm tự khai (đã duyệt)"
        subtitle={`${result.selfViolations.length} đơn`}
        empty="Không có đơn vi phạm."
      >
        {result.selfViolations.length > 0 && (
          <ul className="divide-y divide-neutral-200/60">
            {result.selfViolations.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <ShieldAlert size={14} className="text-rose-600 shrink-0" />
                <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(v.reportDate + "T00:00:00+07:00", "dd/MM")}</span>
                <span className="text-xs text-neutral-500 flex-1">{v.itemCount} lỗi</span>
                <span className="text-rose-700 font-semibold tabular-nums shrink-0">−{Math.round(v.totalAmount).toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Tổng */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-5 space-y-2">
        <div className="flex items-center gap-2 text-rose-900 mb-2">
          <TrendingDown size={18} />
          <h2 className="font-semibold">Tổng tiền trừ lương — {formatVN(`${monthStr}-01T00:00:00+07:00`, "MM/yyyy")}</h2>
        </div>
        <TotalRow label="Phạt đi muộn / về sớm" value={result.totalLatePenalty} />
        <TotalRow label="Trừ lương từ nghỉ vượt phép + nghỉ giờ + online" value={result.totalWageDeduction} />
        <TotalRow label="Vi phạm tự khai" value={result.totalSelfViolation} />
        <div className="pt-2 mt-2 border-t border-rose-300/60 flex items-center justify-between">
          <span className="font-semibold text-rose-900">Tổng cộng</span>
          <span className="text-2xl font-bold text-rose-700 tabular-nums">−{Math.round(result.grandTotal).toLocaleString("en-US")} VND</span>
        </div>
        <p className="text-xs text-rose-700/80 mt-1">
          Lương thực nhận tạm tính: <b className="tabular-nums">{Math.max(0, result.salary - result.grandTotal).toLocaleString("en-US")} VND</b>{" "}
          (= {result.salary.toLocaleString("en-US")} − {Math.round(result.grandTotal).toLocaleString("en-US")})
        </p>
      </div>
    </div>
  );
}

const ONLINE_WFH_FREE_DAYS = 3;

function monthEndDate(year: number, month: number): string {
  // start of next month, để dùng với .lt() (less-than)
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}-01`;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  tone: "sky" | "indigo" | "amber" | "emerald" | "rose";
}) {
  const toneCls = {
    sky:     "bg-sky-50 text-sky-700",
    indigo:  "bg-indigo-50 text-indigo-700",
    amber:   "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose:    "bg-rose-50 text-rose-700",
  }[tone];
  return (
    <div className="rounded-xl border border-white/60 glass p-3">
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2", toneCls)}>
        <Icon size={14} />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  empty,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle?: string;
  empty: string;
  children?: React.ReactNode;
}) {
  const hasChildren = !!children;
  return (
    <section className="rounded-2xl border border-white/60 glass overflow-hidden">
      <header className="px-3 py-2.5 border-b border-neutral-200/60 flex items-center gap-2">
        <Icon size={14} className="text-neutral-500" />
        <h3 className="font-semibold text-sm">{title}</h3>
        {subtitle && <span className="text-xs text-neutral-500 ml-auto">{subtitle}</span>}
      </header>
      {hasChildren ? children : (
        <div className="px-3 py-4 text-xs text-neutral-400 text-center">{empty}</div>
      )}
    </section>
  );
}

function LeaveList({ items }: { items: Array<{
  id: string;
  date: string;
  category: LeaveCategory;
  durationLabel: string;
  phepUsed: number;
  wageDays: number;
  wageHours: number;
  freeDays: number;
  wageDeduction: number;
  label: "free" | "phep" | "wage" | "phep_wage";
}>}) {
  return (
    <ul className="divide-y divide-neutral-200/60">
      {items.map((it) => (
        <li key={it.id} className="px-3 py-2.5 flex items-center gap-2 text-sm flex-wrap">
          <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(it.date + "T00:00:00+07:00", "dd/MM")}</span>
          <span className="text-xs text-neutral-500 shrink-0">{LEAVE_CATEGORIES[it.category]}</span>
          <span className="text-xs font-medium text-neutral-700 shrink-0">{it.durationLabel}</span>
          <div className="flex-1" />
          <LeaveLabel label={it.label} phepUsed={it.phepUsed} wageDays={it.wageDays} wageHours={it.wageHours} freeDays={it.freeDays} />
          {it.wageDeduction > 0 && (
            <span className="text-rose-700 font-semibold tabular-nums shrink-0 ml-2">−{Math.round(it.wageDeduction).toLocaleString("en-US")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function LeaveLabel({
  label,
  phepUsed,
  wageDays,
  wageHours,
  freeDays,
}: {
  label: "free" | "phep" | "wage" | "phep_wage";
  phepUsed: number;
  wageDays: number;
  wageHours: number;
  freeDays: number;
}) {
  const f = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  if (label === "free") {
    return <Badge tone="neutral">Miễn phí{freeDays > 0 ? ` (${f(freeDays)}d)` : ""}</Badge>;
  }
  if (label === "phep") {
    return <Badge tone="amber">Trừ phép {f(phepUsed)}d</Badge>;
  }
  if (label === "wage") {
    if (wageHours > 0) return <Badge tone="rose">Trừ lương {f(wageHours)}h</Badge>;
    return <Badge tone="rose">Trừ lương {f(wageDays)}d</Badge>;
  }
  // phep_wage
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone="amber">Phép {f(phepUsed)}d</Badge>
      <Badge tone="rose">Lương {f(wageDays)}d</Badge>
    </span>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "neutral" | "amber" | "rose" }) {
  const cls = {
    neutral: "bg-neutral-100 text-neutral-600",
    amber:   "bg-amber-50 text-amber-700",
    rose:    "bg-rose-50 text-rose-700",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded", cls)}>
      {children}
    </span>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-rose-800/80">{label}</span>
      <span className="font-medium text-rose-700 tabular-nums">{value > 0 ? "−" : ""}{Math.round(value).toLocaleString("en-US")} VND</span>
    </div>
  );
}
