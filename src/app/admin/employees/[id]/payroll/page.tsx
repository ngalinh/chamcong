import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { LEAVE_CATEGORIES, type Employee, type LeaveCategory } from "@/types/db";
import type { PayrollResult, ParttimePayrollResult } from "@/lib/payroll";
import { parseYearMonth, yearMonthVN } from "@/lib/workdays";
import { formatVN } from "@/lib/time";
import { computePayrollForMonth, type PayrollSnapshotPayload } from "@/lib/payroll-snapshot";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  Wallet,
  CalendarOff,
  Hourglass,
  Wifi,
  ShieldAlert,
  Sparkles,
  Clock,
  AlertTriangle,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Trash2,
} from "lucide-react";

async function excuseAbsence(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("id, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const employeeId = String(formData.get("employee_id") ?? "");
  const date = String(formData.get("absence_date") ?? "");
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Dữ liệu không hợp lệ");
  }

  const admin = createAdminClient();
  // Insert excused absence (idempotent qua UNIQUE)
  const { error: insErr } = await admin
    .from("excused_absences")
    .insert({
      employee_id: employeeId,
      absence_date: date,
      excused_by: me?.id ?? null,
    });
  if (insErr && insErr.code !== "23505") throw new Error(insErr.message);

  // Invalidate snapshot tháng đó (nếu có) để bảng lương recompute live ra
  // số mới — nhưng chỉ làm khi tháng đó chưa bị cleanup data thật. Cleanup
  // chỉ động vào tháng <100 ngày, mà nút xoá cũng chỉ hiện cho tháng chưa
  // snapshot → trong trường hợp UI flow chuẩn, snapshot sẽ không tồn tại.
  // Vẫn delete cho chắc nếu race.
  const ym = date.slice(0, 7); // YYYY-MM
  await admin
    .from("payroll_snapshots")
    .delete()
    .eq("employee_id", employeeId)
    .eq("year_month", ym);

  revalidatePath(`/admin/employees/${employeeId}/payroll`);
}

export const dynamic = "force-dynamic";

const fmtVnd = (n: number) => `${Math.round(n).toLocaleString("en-US")} VND`;
const fmtHours = (h: number) => `${h.toFixed(2).replace(/\.?0+$/, "")} h`;

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

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle<Employee>();
  if (!emp) notFound();

  const isParttime = emp.employment_type === "parttime";

  // Tháng cũ có thể đã bị cleanup-history xoá raw data → đọc snapshot trước.
  // Tháng hiện tại / chưa snapshot → compute live như cũ.
  const { data: snapshotRow } = await admin
    .from("payroll_snapshots")
    .select("data")
    .eq("employee_id", emp.id)
    .eq("year_month", monthStr)
    .maybeSingle();
  const payload: PayrollSnapshotPayload = snapshotRow?.data
    ? (snapshotRow.data as PayrollSnapshotPayload)
    : await computePayrollForMonth(admin, emp, monthStr);
  const fromSnapshot = !!snapshotRow?.data;

  // Prev/next month link
  const prev = ym.month === 1 ? { y: ym.year - 1, m: 12 } : { y: ym.year, m: ym.month - 1 };
  const next = ym.month === 12 ? { y: ym.year + 1, m: 1 } : { y: ym.year, m: ym.month + 1 };
  const prevHref = `/admin/employees/${id}/payroll?month=${prev.y}-${String(prev.m).padStart(2, "0")}`;
  const nextHref = `/admin/employees/${id}/payroll?month=${next.y}-${String(next.m).padStart(2, "0")}`;

  const header = (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/admin/employees"
          className="h-9 w-9 rounded-full hover:bg-white/50 flex items-center justify-center text-neutral-600"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium flex items-center gap-1.5">
            Bảng lương
            <span className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1",
              isParttime ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700",
            )}>
              <Briefcase size={9} /> {isParttime ? "Parttime" : "Fulltime"}
            </span>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{emp.name}</h1>
          <p className="text-xs text-neutral-500">{emp.email}</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/60 glass p-2">
        <Link href={prevHref} className="h-9 w-9 rounded-lg hover:bg-white/70 flex items-center justify-center text-neutral-600">
          <ChevronLeft size={18} />
        </Link>
        <form action={`/admin/employees/${id}/payroll`} className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            key={monthStr}
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
    </>
  );

  if (payload.kind === "parttime") {
    return (
      <div className="space-y-5">
        {header}
        {fromSnapshot && <SnapshotBanner />}
        <ParttimeView result={payload.result} monthStr={monthStr} workShifts={payload.workShifts} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      {fromSnapshot && <SnapshotBanner />}
      <FulltimeView result={payload.result} monthStr={monthStr} employeeId={emp.id} editable={!fromSnapshot} />
    </div>
  );
}

function SnapshotBanner() {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800">
      Bảng lương hiển thị từ snapshot — raw data tháng này đã được cleanup
      sau {">"} 100 ngày. Nội dung không thay đổi nữa.
    </div>
  );
}

// =============================================================================
// PARTTIME VIEW
// =============================================================================
function ParttimeView({
  result,
  monthStr,
  workShifts,
}: {
  result: ParttimePayrollResult;
  monthStr: string;
  workShifts: { start: string; end: string }[];
}) {
  const shiftsLabel = workShifts.length === 1
    ? `${workShifts[0].start.slice(0, 5)}–${workShifts[0].end.slice(0, 5)}`
    : `${workShifts.length} ca`;
  const allShiftsLabel = workShifts.map((s) => `${s.start.slice(0, 5)}–${s.end.slice(0, 5)}`).join(", ");
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <SummaryCard icon={Clock}     label={`Tổng giờ làm (${shiftsLabel})`}  value={fmtHours(result.workedHours)} tone="sky" />
        <SummaryCard icon={Wallet}    label="Lương / giờ"     value={fmtVnd(result.hourlyRate)}                tone="indigo" />
        <SummaryCard icon={Hourglass} label="OT đã duyệt"     value={fmtHours(result.approvedOTHours)}         tone="amber" />
        <SummaryCard icon={Wallet}    label="Lương OT / giờ"  value={fmtVnd(result.overtimeRate)}              tone="violet" />
      </div>

      {result.hourlyRate === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            Lương theo giờ đang là <b>0 VND</b>. Vào trang
            <Link href="/admin/employees" className="underline mx-1">Nhân viên</Link>
            để cập nhật.
          </div>
        </div>
      )}

      {/* Shifts */}
      <Section
        icon={Calendar}
        title="Ca làm việc trong tháng"
        subtitle={`${result.shifts.length} ca · giờ trong khung ${allShiftsLabel} mới tính lương, ngoài khung gửi đơn OT`}
        empty="Chưa có ca làm việc nào trong tháng này."
      >
        {result.shifts.length > 0 && (
          <ul className="divide-y divide-neutral-200/60">
            {result.shifts.map((sh, i) => {
              const exceededOT = sh.endAt && sh.actualHours - sh.hours > 0.02; // > 1 phút sai lệch
              return (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm flex-wrap">
                  <span className="text-xs font-mono text-neutral-400 tabular-nums w-8">#{i + 1}</span>
                  <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">
                    {formatVN(sh.startAt, "dd/MM HH:mm")}
                  </span>
                  <span className="text-neutral-400">→</span>
                  <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">
                    {sh.endAt ? formatVN(sh.endAt, "dd/MM HH:mm") : "—"}
                  </span>
                  <span className="flex-1" />
                  {sh.endAt ? (
                    <>
                      <span className="text-emerald-700 font-semibold tabular-nums shrink-0">
                        {fmtHours(sh.hours)}
                      </span>
                      {exceededOT && (
                        <span className="text-[10px] text-neutral-500 shrink-0">
                          (thực tế {fmtHours(sh.actualHours)})
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge tone="amber">Chưa check-out</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Đi muộn / Về sớm */}
      <LateEarlySection result={result} />

      {/* OT */}
      <OvertimeSection overtimes={result.overtimes} hourLabel={`${fmtVnd(result.overtimeRate > 0 ? result.overtimeRate : result.hourlyRate)}/giờ`} />

      {/* Bonus / Violation */}
      <BonusSection bonuses={result.selfBonuses} />
      <ViolationSection violations={result.selfViolations} />

      {/* Tổng */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 space-y-2">
        <div className="flex items-center gap-2 text-emerald-900 mb-2">
          <Wallet size={18} />
          <h2 className="font-semibold">Tổng kết — {formatVN(`${monthStr}-01T00:00:00+07:00`, "MM/yyyy")}</h2>
        </div>
        <EarnRow label={`Lương theo giờ (${fmtHours(result.workedHours)} × ${fmtVnd(result.hourlyRate)})`} value={result.basePay} positive />
        {result.approvedOTHours > 0 && (
          <EarnRow label={`Lương OT (${fmtHours(result.approvedOTHours)} × ${fmtVnd(result.overtimeRate)})`} value={result.otPay} positive />
        )}
        {result.totalLatePenalty > 0 && (
          <EarnRow label="Phạt đi muộn / về sớm" value={result.totalLatePenalty} />
        )}
        {result.totalSelfViolation > 0 && (
          <EarnRow label="Vi phạm tự khai" value={result.totalSelfViolation} />
        )}
        {result.totalSelfBonus > 0 && (
          <EarnRow label="Thưởng tự khai" value={result.totalSelfBonus} positive />
        )}
        <div className="pt-2 mt-2 border-t border-emerald-300/60 flex items-center justify-between">
          <span className="font-semibold text-emerald-900">Lương thực nhận tạm tính</span>
          <span className="text-2xl font-bold text-emerald-700 tabular-nums">{Math.max(0, Math.round(result.grandEarning)).toLocaleString("en-US")} VND</span>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// FULLTIME VIEW
// =============================================================================
function FulltimeView({
  result,
  monthStr,
  employeeId,
  editable,
}: {
  result: PayrollResult;
  monthStr: string;
  employeeId: string;
  editable: boolean;
}) {
  // Group leaves theo loại
  const leavesByCat: Record<string, typeof result.leaves> = {};
  for (const lv of result.leaves) {
    const k = lv.category;
    leavesByCat[k] ??= [];
    leavesByCat[k].push(lv);
  }

  return (
    <>
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

      <LateEarlySection result={result} />

      <Section icon={CalendarOff} title="Nghỉ theo ngày" subtitle={`${(leavesByCat.leave_paid ?? []).length} đơn`} empty="Không có đơn nghỉ theo ngày.">
        {leavesByCat.leave_paid && <LeaveList items={leavesByCat.leave_paid} />}
      </Section>

      <Section icon={Hourglass} title="Nghỉ theo giờ" subtitle={`${(leavesByCat.leave_hourly ?? []).length} đơn`} empty="Không có đơn nghỉ theo giờ.">
        {leavesByCat.leave_hourly && <LeaveList items={leavesByCat.leave_hourly} />}
      </Section>

      <Section icon={Wifi} title="Làm online" subtitle={`${[...(leavesByCat.online_wfh ?? []), ...(leavesByCat.online_rain ?? [])].length} đơn · ${ONLINE_WFH_FREE_DAYS} ngày WFH đầu free`} empty="Không có đơn làm online.">
        {(leavesByCat.online_wfh || leavesByCat.online_rain) && (
          <LeaveList items={[...(leavesByCat.online_wfh ?? []), ...(leavesByCat.online_rain ?? [])].sort((a, b) => a.date.localeCompare(b.date))} />
        )}
      </Section>

      <OvertimeSection overtimes={result.overtimes} hourLabel={`${fmtVnd(result.hourRate)}/giờ`} />
      <BonusSection bonuses={result.selfBonuses} />
      <ViolationSection violations={result.selfViolations} />
      <MissingDaysSection
        missingDays={result.missingDays}
        dayRate={result.dayRate}
        employeeId={employeeId}
        editable={editable}
      />

      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-5 space-y-2">
        <div className="flex items-center gap-2 text-rose-900 mb-2">
          <TrendingDown size={18} />
          <h2 className="font-semibold">Tổng kết — {formatVN(`${monthStr}-01T00:00:00+07:00`, "MM/yyyy")}</h2>
        </div>
        <TotalRow label="Phạt đi muộn / về sớm" value={result.totalLatePenalty} />
        <TotalRow label="Trừ lương từ nghỉ vượt phép + nghỉ giờ + online" value={result.totalWageDeduction} />
        <TotalRow label="Vi phạm tự khai" value={result.totalSelfViolation} />
        {result.totalMissingDeduction > 0 && (
          <TotalRow label="Vắng không phép" value={result.totalMissingDeduction} />
        )}
        {result.totalOTPay > 0 && (
          <TotalRow label="Lương OT (đã duyệt)" value={result.totalOTPay} positive />
        )}
        {result.totalSelfBonus > 0 && (
          <TotalRow label="Thưởng tự khai" value={result.totalSelfBonus} positive />
        )}
        <div className="pt-2 mt-2 border-t border-rose-300/60 flex items-center justify-between">
          <span className="font-semibold text-rose-900">Tổng tiền trừ</span>
          <span className="text-2xl font-bold text-rose-700 tabular-nums">−{Math.round(result.grandTotal).toLocaleString("en-US")} VND</span>
        </div>
        <p className="text-xs text-rose-700/80 mt-1">
          Lương thực nhận tạm tính:{" "}
          <b className="tabular-nums">
            {Math.max(0, result.salary - result.grandTotal + result.totalSelfBonus + result.totalOTPay).toLocaleString("en-US")} VND
          </b>
        </p>
      </div>
    </>
  );
}

// =============================================================================
// Shared sections
// =============================================================================
function LateEarlySection({ result }: { result: { lateEarlyViolations: PayrollResult["lateEarlyViolations"] } }) {
  const penalizedCount = result.lateEarlyViolations.filter((v) => v.penaltyAmount > 0).length;
  const heavyCount = result.lateEarlyViolations.filter((v) => v.isHeavyLate).length;
  return (
    <Section
      icon={Clock}
      title="Đi muộn / Về sớm"
      subtitle={`${result.lateEarlyViolations.length} lần · ${penalizedCount} lần phạt${heavyCount > 0 ? ` (${heavyCount} muộn nặng)` : ""}`}
      empty="Không có vi phạm đi muộn / về sớm."
    >
      {result.lateEarlyViolations.length > 0 && (
        <ul className="divide-y divide-neutral-200/60">
          {result.lateEarlyViolations.map((v, idx) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="text-xs font-mono text-neutral-400 tabular-nums w-8">#{idx + 1}</span>
              <span className={cn(
                "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
                v.isHeavyLate
                  ? "bg-rose-50 text-rose-700"
                  : v.kind === "late" ? "bg-amber-50 text-amber-700" : "bg-orange-50 text-orange-700",
              )}>
                {v.isHeavyLate ? "Muộn nặng" : v.kind === "late" ? "Muộn" : "Về sớm"}
              </span>
              <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(v.at, "dd/MM HH:mm")}</span>
              <span className="text-xs text-neutral-500 truncate flex-1">{v.office ?? "—"} · {v.minutes}p</span>
              {v.penaltyAmount > 0 ? (
                <span className="text-rose-700 font-semibold tabular-nums shrink-0">−{Math.round(v.penaltyAmount).toLocaleString("en-US")}</span>
              ) : (
                <span className="text-xs text-neutral-400 shrink-0">Miễn phí (≤3)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function OvertimeSection({ overtimes, hourLabel }: { overtimes: PayrollResult["overtimes"]; hourLabel: string }) {
  const total = overtimes.reduce((s, o) => s + o.pay, 0);
  return (
    <Section
      icon={Hourglass}
      title="Làm OT (đơn đã duyệt)"
      subtitle={`${overtimes.length} đơn · ${hourLabel} · tổng +${Math.round(total).toLocaleString("en-US")}`}
      empty="Không có đơn OT trong tháng này."
    >
      {overtimes.length > 0 && (
        <ul className="divide-y divide-neutral-200/60">
          {overtimes.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Hourglass size={14} className="text-violet-600 shrink-0" />
              <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(o.date + "T00:00:00+07:00", "dd/MM")}</span>
              <span className="font-mono tabular-nums text-xs text-neutral-500 shrink-0">{o.startTime.slice(0, 5)}–{o.endTime.slice(0, 5)}</span>
              <span className="text-xs text-neutral-700 shrink-0">{fmtHours(o.hours)}</span>
              <span className="flex-1 text-xs text-neutral-500 truncate">{o.reason ?? ""}</span>
              <span className="text-emerald-700 font-semibold tabular-nums shrink-0">+{Math.round(o.pay).toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function BonusSection({ bonuses }: { bonuses: PayrollResult["selfBonuses"] }) {
  return (
    <Section icon={Sparkles} title="Thưởng tự khai (đã duyệt)" subtitle={`${bonuses.length} đơn`} empty="Không có đơn thưởng.">
      {bonuses.length > 0 && (
        <ul className="divide-y divide-neutral-200/60">
          {bonuses.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Sparkles size={14} className="text-emerald-600 shrink-0" />
              <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(v.reportDate + "T00:00:00+07:00", "dd/MM")}</span>
              <span className="text-xs text-neutral-500 flex-1">{v.itemCount} mục</span>
              <span className="text-emerald-700 font-semibold tabular-nums shrink-0">+{Math.round(v.totalAmount).toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ViolationSection({ violations }: { violations: PayrollResult["selfViolations"] }) {
  return (
    <Section icon={ShieldAlert} title="Vi phạm tự khai (đã duyệt)" subtitle={`${violations.length} đơn`} empty="Không có đơn vi phạm.">
      {violations.length > 0 && (
        <ul className="divide-y divide-neutral-200/60">
          {violations.map((v) => (
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
  );
}

function MissingDaysSection({
  missingDays,
  dayRate,
  employeeId,
  editable,
}: {
  missingDays: PayrollResult["missingDays"];
  dayRate: number;
  employeeId: string;
  editable: boolean;
}) {
  return (
    <Section
      icon={AlertTriangle}
      title="Vắng không phép"
      subtitle={missingDays.length > 0
        ? `${missingDays.length} ngày · ${fmtVnd(missingDays.reduce((s, d) => s + d.amount, 0))}`
        : `0 ngày · trừ ${fmtVnd(dayRate)}/ngày T2-T6, ${fmtVnd(dayRate * 0.5)}/sáng T7`}
      empty="Không có ngày nào vắng không phép. Admin có thể 'Thêm chấm công' nếu NV quên chấm."
    >
      {missingDays.length > 0 && (
        <ul className="divide-y divide-neutral-200/60">
          {missingDays.map((d) => (
            <li key={d.date} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <AlertTriangle size={14} className="text-rose-600 shrink-0" />
              <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">
                {formatVN(d.date + "T00:00:00+07:00", "EEEE, dd/MM")}
              </span>
              <span className="text-xs text-neutral-500 flex-1">
                {d.dayValue === 1 ? "Cả ngày" : "Sáng T7"}
              </span>
              <span className="text-rose-700 font-semibold tabular-nums shrink-0">
                −{Math.round(d.amount).toLocaleString("en-US")}
              </span>
              {editable && (
                <form action={excuseAbsence}>
                  <input type="hidden" name="employee_id" value={employeeId} />
                  <input type="hidden" name="absence_date" value={d.date} />
                  <button
                    type="submit"
                    title="Miễn trừ ngày này (không trừ lương, không tính vắng)"
                    className="h-7 w-7 rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// =============================================================================
// Helpers
// =============================================================================
const ONLINE_WFH_FREE_DAYS = 3;

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
  tone: "sky" | "indigo" | "amber" | "emerald" | "rose" | "violet";
}) {
  const toneCls = {
    sky:     "bg-sky-50 text-sky-700",
    indigo:  "bg-indigo-50 text-indigo-700",
    amber:   "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose:    "bg-rose-50 text-rose-700",
    violet:  "bg-violet-50 text-violet-700",
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

function TotalRow({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  const sign = positive ? "+" : value > 0 ? "−" : "";
  const cls = positive ? "text-emerald-700" : "text-rose-700";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-rose-800/80">{label}</span>
      <span className={cn("font-medium tabular-nums", cls)}>{sign}{Math.round(value).toLocaleString("en-US")} VND</span>
    </div>
  );
}

function EarnRow({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  const sign = positive ? "+" : value > 0 ? "−" : "";
  const cls = positive ? "text-emerald-700" : "text-rose-700";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-emerald-900/80">{label}</span>
      <span className={cn("font-medium tabular-nums", cls)}>{sign}{Math.round(value).toLocaleString("en-US")} VND</span>
    </div>
  );
}
