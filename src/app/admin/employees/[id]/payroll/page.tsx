import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { computeProfitForEmployee, type EmployeeProfit } from "@/lib/profit";
import { LEAVE_CATEGORIES, type Employee, type LeaveCategory } from "@/types/db";
import type { PayrollResult, ParttimePayrollResult } from "@/lib/payroll";
import { parseYearMonth, yearMonthVN } from "@/lib/workdays";
import { formatVN } from "@/lib/time";
import { computePayrollForMonth, type PayrollSnapshotPayload } from "@/lib/payroll-snapshot";
import { LeaveHourlyDeductionEditor } from "@/components/LeaveHourlyDeductionEditor";
import { SelfReportItemAmountEditor } from "@/components/SelfReportItemAmountEditor";
import OpeningBalanceEditor from "@/components/OpeningBalanceEditor";
import { ConfirmForm } from "@/components/ConfirmForm";
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

async function restoreAbsence(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const employeeId = String(formData.get("employee_id") ?? "");
  const date = String(formData.get("absence_date") ?? "");
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Dữ liệu không hợp lệ");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("excused_absences")
    .delete()
    .eq("employee_id", employeeId)
    .eq("absence_date", date);
  if (error) throw new Error(error.message);

  const ym = date.slice(0, 7);
  await admin
    .from("payroll_snapshots")
    .delete()
    .eq("employee_id", employeeId)
    .eq("year_month", ym);

  revalidatePath(`/admin/employees/${employeeId}/payroll`);
}

async function setLeaveWageOverride(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const leaveId = String(formData.get("leave_id") ?? "");
  const employeeId = String(formData.get("employee_id") ?? "");
  const leaveDate = String(formData.get("leave_date") ?? "");
  const overrideRaw = String(formData.get("override") ?? "").trim();

  if (!leaveId || !employeeId) throw new Error("Dữ liệu không hợp lệ");

  // Empty → reset về NULL (compute lại). Số → set override.
  let override: number | null;
  if (overrideRaw === "") {
    override = null;
  } else {
    const n = Number(overrideRaw.replace(/,/g, "").replace(/\s/g, ""));
    if (!Number.isFinite(n) || n < 0) throw new Error("Số tiền không hợp lệ");
    override = n;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("leave_requests")
    .update({ wage_deduction_override: override })
    .eq("id", leaveId);
  if (error) throw new Error(error.message);

  // Invalidate snapshot tháng đó (nếu có) để bảng lương recompute
  if (/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
    const ym = leaveDate.slice(0, 7);
    await admin
      .from("payroll_snapshots")
      .delete()
      .eq("employee_id", employeeId)
      .eq("year_month", ym);
  }

  revalidatePath(`/admin/employees/${employeeId}/payroll`);
}

async function clearLateEarlyViolation(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const checkInId = String(formData.get("check_in_id") ?? "");
  const employeeId = String(formData.get("employee_id") ?? "");
  const monthStr = String(formData.get("month") ?? "");
  if (!checkInId || !employeeId) throw new Error("Dữ liệu không hợp lệ");

  const admin = createAdminClient();
  const { error } = await admin
    .from("check_ins")
    .update({ late_minutes: 0, early_minutes: 0 })
    .eq("id", checkInId);
  if (error) throw new Error(error.message);

  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    await admin
      .from("payroll_snapshots")
      .delete()
      .eq("employee_id", employeeId)
      .eq("year_month", monthStr);
  }

  revalidatePath(`/admin/employees/${employeeId}/payroll`);
}

async function setOpeningBalance(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const employeeId = String(formData.get("employee_id") ?? "");
  const monthStr = String(formData.get("month") ?? "");
  const balanceRaw = parseFloat(String(formData.get("balance") ?? ""));
  if (!employeeId || !/^\d{4}-\d{2}$/.test(monthStr) || isNaN(balanceRaw)) {
    throw new Error("Dữ liệu không hợp lệ");
  }
  const balance = Math.round(balanceRaw * 100) / 100;

  const admin = createAdminClient();

  // Cập nhật leave_balance + last_accrual_month = monthStr (anchor tháng đầu)
  await admin.from("employees").update({
    leave_balance: balance,
    last_accrual_month: monthStr,
  }).eq("id", employeeId);

  // Upsert accrual log cho tháng này (để Case A lookup tìm được)
  const { data: existingLog } = await admin
    .from("leave_balance_log")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("event_type", "accrual")
    .ilike("note", `%${monthStr}%`)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLog) {
    await admin.from("leave_balance_log").update({
      // Lưu cả giá trị và marker rõ ràng. Không thể chỉ dùng `delta !== 1`
      // làm marker vì admin hoàn toàn có thể nhập số dư đầu kỳ bằng 1.
      delta: balance,
      balance_after: balance,
      note: `Số dư phép đầu kỳ ${monthStr} (admin nhập)`,
    }).eq("id", existingLog.id);
  } else {
    await admin.from("leave_balance_log").insert({
      employee_id: employeeId,
      delta: balance,
      balance_after: balance,
      event_type: "accrual",
      note: `Số dư phép đầu kỳ ${monthStr} (admin nhập)`,
    });
  }

  // Xoá snapshot của tháng này và tất cả tháng sau → recompute
  await admin.from("payroll_snapshots")
    .delete()
    .eq("employee_id", employeeId)
    .gte("year_month", monthStr);

  revalidatePath(`/admin/employees/${employeeId}/payroll`);
}

async function addPayrollAdjustment(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const employeeId = String(formData.get("employee_id") ?? "");
  const month = String(formData.get("month") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const amountRaw = Number(String(formData.get("amount") ?? "0").replace(/[,\s]/g, ""));
  if (!employeeId || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Dữ liệu không hợp lệ");
  if (!label) throw new Error("Thiếu mô tả");
  if (!Number.isFinite(amountRaw) || amountRaw === 0) throw new Error("Số tiền không hợp lệ");

  const admin = createAdminClient();
  const { error } = await admin.from("payroll_adjustments").insert({
    employee_id: employeeId,
    month,
    label,
    amount: Math.round(amountRaw),
    created_by: user.email,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/employees/${employeeId}/payroll`);
}

async function removePayrollAdjustment(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id") ?? "");
  const employeeId = String(formData.get("employee_id") ?? "");
  if (!id) throw new Error("Thiếu id");

  const admin = createAdminClient();
  const { error } = await admin.from("payroll_adjustments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/employees/${employeeId}/payroll`);
}

// Xoá 1 đơn tự khai (thưởng hoặc vi phạm — cùng bảng violation_reports, phân biệt qua cột kind)
async function deleteSelfReport(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id") ?? "");
  const employeeId = String(formData.get("employee_id") ?? "");
  const monthStr = String(formData.get("month") ?? "");
  if (!id || !employeeId) throw new Error("Thiếu id");

  const admin = createAdminClient();
  const { error } = await admin.from("violation_reports").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    await admin.from("payroll_snapshots").delete()
      .eq("employee_id", employeeId)
      .eq("year_month", monthStr);
  }

  revalidatePath(`/admin/employees/${employeeId}/payroll`);
}

// Sửa số tiền của 1 mục (violation_items) trong đơn tự khai — tự tính lại total_amount của đơn cha
async function updateSelfReportItemAmount(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const itemId = String(formData.get("item_id") ?? "");
  const reportId = String(formData.get("report_id") ?? "");
  const employeeId = String(formData.get("employee_id") ?? "");
  const monthStr = String(formData.get("month") ?? "");
  const amountRaw = Number(String(formData.get("amount") ?? "").replace(/[,\s]/g, ""));
  if (!itemId || !reportId || !employeeId) throw new Error("Dữ liệu không hợp lệ");
  if (!Number.isFinite(amountRaw) || amountRaw < 0) throw new Error("Số tiền không hợp lệ");

  const admin = createAdminClient();
  const { error: itemErr } = await admin
    .from("violation_items")
    .update({ amount: Math.round(amountRaw) })
    .eq("id", itemId);
  if (itemErr) throw new Error(itemErr.message);

  // total_amount của đơn cha = tổng amount các mục con
  const { data: items } = await admin
    .from("violation_items")
    .select("amount")
    .eq("report_id", reportId);
  const newTotal = (items ?? []).reduce((s: number, it: { amount: number }) => s + Number(it.amount), 0);
  const { error: reportErr } = await admin
    .from("violation_reports")
    .update({ total_amount: newTotal })
    .eq("id", reportId);
  if (reportErr) throw new Error(reportErr.message);

  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    await admin.from("payroll_snapshots").delete()
      .eq("employee_id", employeeId)
      .eq("year_month", monthStr);
  }

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
  searchParams: Promise<{ month?: string; from?: string }>;
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
  const backHref = sp.from === "summary"
    ? `/admin/employees/payroll-summary?month=${monthStr}`
    : "/admin/employees";;

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

  const otFixedSalary =
    emp.ot_fixed_salary_pending_month && emp.ot_fixed_salary_pending_month <= monthStr
      ? Number(emp.ot_fixed_salary_pending ?? 0)
      : Number(emp.ot_fixed_salary ?? 0);
  // Profit luôn tính live: cleanup-history không xoá profit_channels/profit_rules/order_data,
  // chỉ xoá data chấm công — nên snapshot (dữ liệu chấm công cũ) không ảnh hưởng tới profit.
  const profitData = await computeProfitForEmployee(emp.id, monthStr);

  const { data: adjustmentsRaw } = await admin
    .from("payroll_adjustments")
    .select("id, label, amount")
    .eq("employee_id", emp.id)
    .eq("month", monthStr)
    .order("created_at");
  const adjustments = (adjustmentsRaw ?? []) as { id: string; label: string; amount: number }[];
  const adjustmentsTotal = adjustments.reduce((s, a) => s + Number(a.amount), 0);

  // Chi tiết từng mục thưởng/vi phạm tự khai — chỉ tháng đang live mới còn violation_items gốc
  // (cleanup-history xoá violation_reports/violation_items sau khi đã snapshot bảng lương).
  const selfReports = [...payload.result.selfBonuses, ...payload.result.selfViolations];
  const selfReportItemsByReport = new Map<string, { id: string; description: string; amount: number }[]>();
  if (!fromSnapshot && selfReports.length > 0) {
    const { data: itemsRaw } = await admin
      .from("violation_items")
      .select("id, report_id, description, amount")
      .in("report_id", selfReports.map((r) => r.id))
      .order("position");
    for (const it of itemsRaw ?? []) {
      const list = selfReportItemsByReport.get(it.report_id) ?? [];
      list.push({ id: it.id, description: it.description, amount: Number(it.amount) });
      selfReportItemsByReport.set(it.report_id, list);
    }
  }

  // Excused absences tháng này (để hiện nút Khôi phục)
  const dayStart = `${monthStr}-01`;
  const dayEnd = `${ym.month === 12 ? ym.year + 1 : ym.year}-${String(ym.month === 12 ? 1 : ym.month + 1).padStart(2, "0")}-01`;
  const { data: excusedRaw } = await admin
    .from("excused_absences")
    .select("id, absence_date, reason")
    .eq("employee_id", emp.id)
    .gte("absence_date", dayStart)
    .lt("absence_date", dayEnd)
    .order("absence_date");
  const excusedAbsences = (excusedRaw ?? []) as { id: string; absence_date: string; reason: string | null }[];

  // Prev/next month link
  const prev = ym.month === 1 ? { y: ym.year - 1, m: 12 } : { y: ym.year, m: ym.month - 1 };
  const next = ym.month === 12 ? { y: ym.year + 1, m: 1 } : { y: ym.year, m: ym.month + 1 };
  const fromSuffix = sp.from === "summary" ? "&from=summary" : "";
  const prevHref = `/admin/employees/${id}/payroll?month=${prev.y}-${String(prev.m).padStart(2, "0")}${fromSuffix}`;
  const nextHref = `/admin/employees/${id}/payroll?month=${next.y}-${String(next.m).padStart(2, "0")}${fromSuffix}`;

  const header = (
    <>
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
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
        <ParttimeView
          result={payload.result}
          monthStr={monthStr}
          workShifts={payload.workShifts}
          employeeId={emp.id}
          editable={!fromSnapshot}
          otFixedSalary={otFixedSalary}
          profitItems={profitData.items}
          profitTotal={profitData.total}
          adjustments={adjustments}
          adjustmentsTotal={adjustmentsTotal}
          addAdjustment={addPayrollAdjustment}
          removeAdjustment={removePayrollAdjustment}
          deleteReport={deleteSelfReport}
          itemsByReport={selfReportItemsByReport}
          updateItemAmount={updateSelfReportItemAmount}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      {fromSnapshot && <SnapshotBanner />}
      <FulltimeView
        result={payload.result}
        monthStr={monthStr}
        employeeId={emp.id}
        editable={!fromSnapshot}
        otFixedSalary={otFixedSalary}
        profitItems={profitData.items}
        profitTotal={profitData.total}
        adjustments={adjustments}
        adjustmentsTotal={adjustmentsTotal}
        addAdjustment={addPayrollAdjustment}
        removeAdjustment={removePayrollAdjustment}
        setOpeningBalance={setOpeningBalance}
        excusedAbsences={excusedAbsences}
        restoreAbsence={restoreAbsence}
        deleteReport={deleteSelfReport}
        itemsByReport={selfReportItemsByReport}
        updateItemAmount={updateSelfReportItemAmount}
      />
    </div>
  );
}

function SnapshotBanner() {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800">
      Bảng lương hiển thị từ snapshot — raw data tháng này đã được cleanup
      sau {">"}  100 ngày. Nội dung không thay đổi nữa.
    </div>
  );
}

// =============================================================================
// PARTTIME VIEW
// =============================================================================
type PayrollAdjustment = { id: string; label: string; amount: number };
type AdjustmentAction = (formData: FormData) => Promise<void>;
type SelfReportItem = { id: string; description: string; amount: number };

function ParttimeView({
  result,
  monthStr,
  workShifts,
  employeeId,
  editable,
  otFixedSalary,
  profitItems,
  profitTotal,
  adjustments,
  adjustmentsTotal,
  addAdjustment,
  removeAdjustment,
  deleteReport,
  itemsByReport,
  updateItemAmount,
}: {
  result: ParttimePayrollResult;
  monthStr: string;
  workShifts: { start: string; end: string }[];
  employeeId: string;
  editable: boolean;
  otFixedSalary: number;
  profitItems: EmployeeProfit[];
  profitTotal: number;
  adjustments: PayrollAdjustment[];
  adjustmentsTotal: number;
  addAdjustment: AdjustmentAction;
  removeAdjustment: AdjustmentAction;
  deleteReport: AdjustmentAction;
  itemsByReport: Map<string, SelfReportItem[]>;
  updateItemAmount: AdjustmentAction;
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
      <LateEarlySection result={result} employeeId={employeeId} monthStr={monthStr} editable={editable} />

      {/* OT */}
      <OvertimeSection overtimes={result.overtimes} hourLabel={`${fmtVnd(result.overtimeRate > 0 ? result.overtimeRate : result.hourlyRate)}/giờ`} />

      {/* Bonus / Violation */}
      <BonusSection bonuses={result.selfBonuses} employeeId={employeeId} monthStr={monthStr} editable={editable} deleteReport={deleteReport} itemsByReport={itemsByReport} updateItemAmount={updateItemAmount} />
      <ViolationSection violations={result.selfViolations} employeeId={employeeId} monthStr={monthStr} editable={editable} deleteReport={deleteReport} itemsByReport={itemsByReport} updateItemAmount={updateItemAmount} />

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
        {otFixedSalary > 0 && (
          <EarnRow label="Lương OT cố định" value={otFixedSalary} positive />
        )}
        {profitTotal > 0 && (
          <EarnRow label="Profit từ doanh số" value={profitTotal} positive />
        )}
        <AdjustmentsSection
          adjustments={adjustments}
          employeeId={employeeId}
          monthStr={monthStr}
          addAdjustment={addAdjustment}
          removeAdjustment={removeAdjustment}
        />
        <div className="pt-2 mt-2 border-t border-emerald-300/60 flex items-center justify-between">
          <span className="font-semibold text-emerald-900">Lương thực nhận tạm tính</span>
          <span className="text-2xl font-bold text-emerald-700 tabular-nums">
            {Math.max(0, Math.round(result.grandEarning + otFixedSalary + profitTotal + adjustmentsTotal)).toLocaleString("en-US")} VND
          </span>
        </div>
      </div>
      {profitItems.length > 0 && <ProfitSection items={profitItems} total={profitTotal} />}
    </>
  );
}

// =============================================================================
// FULLTIME VIEW
// =============================================================================
type ExcusedAbsence = { id: string; absence_date: string; reason: string | null };

function FulltimeView({
  result,
  monthStr,
  employeeId,
  editable,
  otFixedSalary,
  profitItems,
  profitTotal,
  adjustments,
  adjustmentsTotal,
  addAdjustment,
  removeAdjustment,
  setOpeningBalance,
  excusedAbsences,
  restoreAbsence,
  deleteReport,
  itemsByReport,
  updateItemAmount,
}: {
  result: PayrollResult;
  monthStr: string;
  employeeId: string;
  editable: boolean;
  otFixedSalary: number;
  profitItems: EmployeeProfit[];
  profitTotal: number;
  adjustments: PayrollAdjustment[];
  adjustmentsTotal: number;
  addAdjustment: AdjustmentAction;
  removeAdjustment: AdjustmentAction;
  setOpeningBalance: AdjustmentAction;
  excusedAbsences: ExcusedAbsence[];
  restoreAbsence: AdjustmentAction;
  deleteReport: AdjustmentAction;
  itemsByReport: Map<string, SelfReportItem[]>;
  updateItemAmount: AdjustmentAction;
}) {
  const leavesByCat: Record<string, typeof result.leaves> = {};
  for (const lv of result.leaves) {
    const k = lv.category;
    leavesByCat[k] ??= [];
    leavesByCat[k].push(lv);
  }

  // Tháng chưa tới: phép chưa chốt → hiện thẻ phép nhưng để 0, ẩn mục "Vắng không phép".
  const currentMonthStr = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
  const isFutureMonth = monthStr > currentMonthStr;

  return (
    <>
      <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4">
        <SummaryCard icon={Calendar}    label="Ngày làm việc"    value={`${formatNum(result.workdays)} ngày`}             tone="sky" />
        <SummaryCard icon={Wallet}      label="Lương / ngày"      value={fmtVnd(result.dayRate)}                            tone="indigo" />
        {editable && monthStr === "2026-05" ? (
          <div className="rounded-xl border border-white/60 glass p-3">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-2 bg-amber-50 text-amber-700">
              <CalendarOff size={14} />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium mb-1">Phép đầu kỳ</div>
            <OpeningBalanceEditor
              employeeId={employeeId}
              monthStr={monthStr}
              initialValue={result.balanceStart}
              action={setOpeningBalance}
            />
          </div>
        ) : (
          <SummaryCard icon={CalendarOff} label="Phép đầu kỳ" value={`${isFutureMonth ? 0 : formatNum(result.balanceStart)} ngày`} tone="amber" />
        )}
        <SummaryCard icon={CalendarOff} label="Phép cuối kỳ"       value={`${isFutureMonth ? 0 : formatNum(result.balanceEnd)} ngày`}    tone={!isFutureMonth && result.balanceEnd < 0 ? "rose" : "emerald"} />
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

      {result.lateEarlyViolations.length > 0 && (
        <LateEarlySection result={result} employeeId={employeeId} monthStr={monthStr} editable={editable} />
      )}

      {(leavesByCat.leave_paid?.length ?? 0) > 0 && (
        <Section icon={CalendarOff} title="Nghỉ theo ngày" subtitle={`${leavesByCat.leave_paid!.length} đơn`} empty="">
          <LeaveList items={leavesByCat.leave_paid!} />
        </Section>
      )}

      {(leavesByCat.leave_hourly?.length ?? 0) > 0 && (
        <Section icon={Hourglass} title="Nghỉ theo giờ" subtitle={`${leavesByCat.leave_hourly!.length} đơn`} empty="">
          <LeaveList items={leavesByCat.leave_hourly!} employeeId={employeeId} editable={editable} />
        </Section>
      )}

      {([...(leavesByCat.online_wfh ?? []), ...(leavesByCat.online_rain ?? [])].length > 0) && (
        <Section icon={Wifi} title="Làm online" subtitle={`${[...(leavesByCat.online_wfh ?? []), ...(leavesByCat.online_rain ?? [])].length} đơn · WFH miễn phí ${ONLINE_WFH_FREE_DAYS}d · Trời mưa miễn phí riêng`} empty="">
          <LeaveList items={[...(leavesByCat.online_wfh ?? []), ...(leavesByCat.online_rain ?? [])].sort((a, b) => a.date.localeCompare(b.date))} />
        </Section>
      )}

      {result.overtimes.length > 0 && (
        <OvertimeSection overtimes={result.overtimes} hourLabel={`${fmtVnd(result.hourRate)}/giờ`} />
      )}
      {result.selfBonuses.length > 0 && <BonusSection bonuses={result.selfBonuses} employeeId={employeeId} monthStr={monthStr} editable={editable} deleteReport={deleteReport} itemsByReport={itemsByReport} updateItemAmount={updateItemAmount} />}
      {result.selfViolations.length > 0 && <ViolationSection violations={result.selfViolations} employeeId={employeeId} monthStr={monthStr} editable={editable} deleteReport={deleteReport} itemsByReport={itemsByReport} updateItemAmount={updateItemAmount} />}
      {!isFutureMonth && (result.missingDays.length > 0 || excusedAbsences.length > 0) && (
        <MissingDaysSection
          missingDays={result.missingDays}
          dayRate={result.dayRate}
          employeeId={employeeId}
          editable={editable}
          excusedAbsences={excusedAbsences}
          restoreAbsence={restoreAbsence}
        />
      )}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 space-y-2">
        <div className="flex items-center gap-2 text-emerald-900 mb-2">
          <Wallet size={18} />
          <h2 className="font-semibold">Tổng kết — {formatVN(`${monthStr}-01T00:00:00+07:00`, "MM/yyyy")}</h2>
        </div>
        {/* Các khoản cộng */}
        <TotalRow label="Lương cứng" value={result.salary} positive />
        {otFixedSalary > 0 && (
          <TotalRow label="Lương OT cố định" value={otFixedSalary} positive />
        )}
        {profitTotal > 0 && (
          <TotalRow label="Profit từ doanh thu" value={profitTotal} positive />
        )}
        {result.totalSelfBonus > 0 && (
          <TotalRow label="Thưởng tự khai" value={result.totalSelfBonus} positive />
        )}
        {result.totalOTPay > 0 && (
          <TotalRow label="Lương OT (đã duyệt)" value={result.totalOTPay} positive />
        )}
        {/* Các khoản trừ */}
        {result.totalLatePenalty > 0 && (
          <TotalRow label="Phạt đi muộn / về sớm" value={result.totalLatePenalty} />
        )}
        {result.totalWageDeduction > 0 && (
          <TotalRow label="Trừ lương từ nghỉ vượt phép + nghỉ giờ + online" value={result.totalWageDeduction} />
        )}
        {result.totalSelfViolation > 0 && (
          <TotalRow label="Vi phạm tự khai" value={result.totalSelfViolation} />
        )}
        {result.totalMissingDeduction > 0 && (
          <TotalRow label="Vắng không phép" value={result.totalMissingDeduction} />
        )}
        <AdjustmentsSection
          adjustments={adjustments}
          employeeId={employeeId}
          monthStr={monthStr}
          addAdjustment={addAdjustment}
          removeAdjustment={removeAdjustment}
        />
        <div className="pt-2 mt-2 border-t border-emerald-300/60 flex items-center justify-between">
          <span className="font-semibold text-emerald-900">Tổng tiền lương</span>
          <span className="text-lg font-bold text-emerald-700 tabular-nums">
            {Math.max(0, Math.round(result.salary - result.grandTotal + result.totalSelfBonus + result.totalOTPay + otFixedSalary + profitTotal + adjustmentsTotal)).toLocaleString("en-US")} VND
          </span>
        </div>
      </div>
      {profitItems.length > 0 && <ProfitSection items={profitItems} total={profitTotal} />}
    </>
  );
}

// =============================================================================
// Shared sections
// =============================================================================
function LateEarlySection({
  result,
  employeeId,
  monthStr,
  editable,
}: {
  result: { lateEarlyViolations: PayrollResult["lateEarlyViolations"] };
  employeeId?: string;
  monthStr?: string;
  editable?: boolean;
}) {
  const penalizedCount = result.lateEarlyViolations.filter((v) => v.penaltyAmount > 0).length;
  const heavyCount = result.lateEarlyViolations.filter((v) => v.isHeavyLate).length;
  const canEdit = editable && employeeId && monthStr;
  return (
    <Section
      icon={Clock}
      title="Đi muộn / Về sớm"
      subtitle={`${result.lateEarlyViolations.length} lần · ${penalizedCount} lần phạt${heavyCount > 0 ? ` (${heavyCount} nặng)` : ""}`}
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
                {v.isHeavyLate
                  ? (v.kind === "late" ? "Muộn nặng" : "Về sớm nặng")
                  : v.kind === "late" ? "Muộn" : "Về sớm"}
              </span>
              <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(v.at, "dd/MM HH:mm")}</span>
              <span className="text-xs text-neutral-500 truncate flex-1">{v.office ?? "—"} · {v.minutes}p</span>
              {v.penaltyAmount > 0 ? (
                <span className="text-rose-700 font-semibold tabular-nums shrink-0">−{Math.round(v.penaltyAmount).toLocaleString("en-US")}</span>
              ) : (
                <span className="text-xs text-neutral-400 shrink-0">Miễn phí (≤3)</span>
              )}
              {canEdit && (
                <ConfirmForm action={clearLateEarlyViolation} message="Xoá vi phạm đi muộn/về sớm này?">
                  <input type="hidden" name="check_in_id" value={v.id} />
                  <input type="hidden" name="employee_id" value={employeeId} />
                  <input type="hidden" name="month" value={monthStr} />
                  <button
                    type="submit"
                    title="Xoá vi phạm này (reset late/early về 0)"
                    className="h-7 w-7 rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </ConfirmForm>
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

function BonusSection({
  bonuses,
  employeeId,
  monthStr,
  editable,
  deleteReport,
  itemsByReport,
  updateItemAmount,
}: {
  bonuses: PayrollResult["selfBonuses"];
  employeeId: string;
  monthStr: string;
  editable: boolean;
  deleteReport: AdjustmentAction;
  itemsByReport: Map<string, SelfReportItem[]>;
  updateItemAmount: AdjustmentAction;
}) {
  return (
    <Section icon={Sparkles} title="Thưởng tự khai (đã duyệt)" subtitle={`${bonuses.length} đơn`} empty="Không có đơn thưởng.">
      {bonuses.length > 0 && (
        <ul className="divide-y divide-neutral-200/60">
          {bonuses.map((v) => {
            const items = itemsByReport.get(v.id) ?? [];
            return (
              <li key={v.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <Sparkles size={14} className="text-emerald-600 shrink-0" />
                  <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(v.reportDate + "T00:00:00+07:00", "dd/MM")}</span>
                  <span className="text-xs text-neutral-500 flex-1">{v.itemCount} mục</span>
                  <span className="text-emerald-700 font-semibold tabular-nums shrink-0">+{Math.round(v.totalAmount).toLocaleString("en-US")}</span>
                  {editable && (
                    <ConfirmForm action={deleteReport} message="Xoá đơn thưởng này? Thao tác không thể hoàn tác.">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="employee_id" value={employeeId} />
                      <input type="hidden" name="month" value={monthStr} />
                      <button
                        type="submit"
                        title="Xoá đơn thưởng"
                        className="h-7 w-7 rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </ConfirmForm>
                  )}
                </div>
                {items.length > 0 && (
                  <ul className="mt-1.5 ml-6 space-y-1.5">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-neutral-600 truncate">{it.description}</span>
                        {editable ? (
                          <SelfReportItemAmountEditor
                            action={updateItemAmount}
                            itemId={it.id}
                            reportId={v.id}
                            employeeId={employeeId}
                            monthStr={monthStr}
                            currentAmount={it.amount}
                            sign="+"
                          />
                        ) : (
                          <span className="text-emerald-700 font-medium tabular-nums text-xs shrink-0">+{Math.round(it.amount).toLocaleString("en-US")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function ViolationSection({
  violations,
  employeeId,
  monthStr,
  editable,
  deleteReport,
  itemsByReport,
  updateItemAmount,
}: {
  violations: PayrollResult["selfViolations"];
  employeeId: string;
  monthStr: string;
  editable: boolean;
  deleteReport: AdjustmentAction;
  itemsByReport: Map<string, SelfReportItem[]>;
  updateItemAmount: AdjustmentAction;
}) {
  return (
    <Section icon={ShieldAlert} title="Vi phạm tự khai (đã duyệt)" subtitle={`${violations.length} đơn`} empty="Không có đơn vi phạm.">
      {violations.length > 0 && (
        <ul className="divide-y divide-neutral-200/60">
          {violations.map((v) => {
            const items = itemsByReport.get(v.id) ?? [];
            return (
              <li key={v.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <ShieldAlert size={14} className="text-rose-600 shrink-0" />
                  <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(v.reportDate + "T00:00:00+07:00", "dd/MM")}</span>
                  <span className="text-xs text-neutral-500 flex-1">{v.itemCount} lỗi</span>
                  <span className="text-rose-700 font-semibold tabular-nums shrink-0">−{Math.round(v.totalAmount).toLocaleString("en-US")}</span>
                  {editable && (
                    <ConfirmForm action={deleteReport} message="Xoá đơn vi phạm này? Thao tác không thể hoàn tác.">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="employee_id" value={employeeId} />
                      <input type="hidden" name="month" value={monthStr} />
                      <button
                        type="submit"
                        title="Xoá đơn vi phạm"
                        className="h-7 w-7 rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </ConfirmForm>
                  )}
                </div>
                {items.length > 0 && (
                  <ul className="mt-1.5 ml-6 space-y-1.5">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-neutral-600 truncate">{it.description}</span>
                        {editable ? (
                          <SelfReportItemAmountEditor
                            action={updateItemAmount}
                            itemId={it.id}
                            reportId={v.id}
                            employeeId={employeeId}
                            monthStr={monthStr}
                            currentAmount={it.amount}
                            sign="-"
                          />
                        ) : (
                          <span className="text-rose-700 font-medium tabular-nums text-xs shrink-0">−{Math.round(it.amount).toLocaleString("en-US")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
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
  excusedAbsences,
  restoreAbsence,
}: {
  missingDays: PayrollResult["missingDays"];
  dayRate: number;
  employeeId: string;
  editable: boolean;
  excusedAbsences: ExcusedAbsence[];
  restoreAbsence: AdjustmentAction;
}) {
  const hasExcused = excusedAbsences.length > 0;
  return (
    <Section
      icon={AlertTriangle}
      title="Vắng không phép"
      subtitle={missingDays.length > 0
        ? `${missingDays.length} ngày · ${fmtVnd(missingDays.reduce((s, d) => s + d.amount, 0))}`
        : `0 ngày · trừ ${fmtVnd(dayRate)}/ngày T2-T6 (T7 làm online, không yêu cầu check-in)`}
      empty={hasExcused ? undefined : "Không có ngày nào vắng không phép. Admin có thể 'Thêm chấm công' nếu NV quên chấm."}
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
                <ConfirmForm action={excuseAbsence} message="Miễn trừ ngày vắng này? NV sẽ không bị trừ lương ngày này.">
                  <input type="hidden" name="employee_id" value={employeeId} />
                  <input type="hidden" name="absence_date" value={d.date} />
                  <button
                    type="submit"
                    title="Miễn trừ ngày này (không trừ lương, không tính vắng)"
                    className="h-7 w-7 rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </ConfirmForm>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasExcused && editable && (
        <details className="group">
          <summary className="px-3 py-2.5 text-xs text-neutral-500 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center gap-2 hover:bg-white/50 border-t border-neutral-200/60">
            <span className="flex-1 font-medium">Đã miễn trừ ({excusedAbsences.length} ngày) — click để khôi phục</span>
            <span className="text-neutral-400 group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <ul className="divide-y divide-amber-100 bg-amber-50/40">
            {excusedAbsences.map((ea) => (
              <li key={ea.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 text-[10px]">✓</span>
                <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">
                  {formatVN(ea.absence_date + "T00:00:00+07:00", "EEEE, dd/MM")}
                </span>
                <span className="text-xs text-neutral-500 flex-1 truncate">
                  {ea.reason ?? "Đã miễn trừ"}
                </span>
                <form action={restoreAbsence}>
                  <input type="hidden" name="employee_id" value={employeeId} />
                  <input type="hidden" name="absence_date" value={ea.absence_date} />
                  <button
                    type="submit"
                    title="Khôi phục — tính lại là ngày vắng không phép"
                    className="h-7 px-2 rounded-md text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition shrink-0"
                  >
                    Khôi phục
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
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
  empty?: string;
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
        <div className="px-3 py-4 text-xs text-neutral-400 text-center">{empty ?? ""}</div>
      )}
    </section>
  );
}

function LeaveList({
  items,
  employeeId,
  editable,
}: {
  items: Array<{
    id: string;
    date: string;
    category: LeaveCategory;
    durationLabel: string;
    startTime: string | null;
    endTime: string | null;
    phepUsed: number;
    wageDays: number;
    wageHours: number;
    freeDays: number;
    wageDeduction: number;
    label: "free" | "phep" | "wage" | "phep_wage";
  }>;
  employeeId?: string;
  editable?: boolean;
}) {
  return (
    <ul className="divide-y divide-neutral-200/60">
      {items.map((it) => (
        <li key={it.id} className="px-3 py-2.5 flex items-center gap-2 text-sm flex-wrap">
          <span className="font-mono tabular-nums text-xs text-neutral-700 shrink-0">{formatVN(it.date + "T00:00:00+07:00", "dd/MM")}</span>
          <span className="text-xs text-neutral-500 shrink-0">{LEAVE_CATEGORIES[it.category]}</span>
          <span className="text-xs font-medium text-neutral-700 shrink-0">{it.durationLabel}</span>
          {it.startTime && it.endTime && (
            <span className="font-mono tabular-nums text-xs text-neutral-400 shrink-0">
              {it.startTime.slice(0, 5)}–{it.endTime.slice(0, 5)}
            </span>
          )}
          <div className="flex-1" />
          <LeaveLabel category={it.category} label={it.label} phepUsed={it.phepUsed} wageDays={it.wageDays} wageHours={it.wageHours} freeDays={it.freeDays} />
          {editable && employeeId && it.category === "leave_hourly" ? (
            <LeaveHourlyDeductionEditor
              action={setLeaveWageOverride}
              leaveId={it.id}
              leaveDate={it.date}
              employeeId={employeeId}
              currentDeduction={it.wageDeduction}
            />
          ) : (
            it.wageDeduction > 0 && (
              <span className="text-rose-700 font-semibold tabular-nums shrink-0 ml-2">−{Math.round(it.wageDeduction).toLocaleString("en-US")}</span>
            )
          )}
        </li>
      ))}
    </ul>
  );
}


function LeaveLabel({
  category,
  label,
  phepUsed,
  wageDays,
  wageHours,
  freeDays,
}: {
  category: LeaveCategory;
  label: "free" | "phep" | "wage" | "phep_wage";
  phepUsed: number;
  wageDays: number;
  wageHours: number;
  freeDays: number;
}) {
  const f = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  const freeBadge = freeDays > 0
    ? <Badge tone="neutral">Miễn phí ({f(freeDays)}d)</Badge>
    : null;
  if (label === "free") {
    return (
      <Badge tone="neutral">
        {category === "online_rain" ? "Miễn phí trời mưa" : "Miễn phí"}
        {freeDays > 0 ? ` (${f(freeDays)}d)` : ""}
      </Badge>
    );
  }
  if (label === "phep") {
    return (
      <span className="inline-flex items-center gap-1">
        {freeBadge}
        <Badge tone="amber">Trừ phép {f(phepUsed)}d</Badge>
      </span>
    );
  }
  if (label === "wage") {
    if (wageHours > 0) return <Badge tone="rose">Trừ lương {f(wageHours)}h</Badge>;
    return (
      <span className="inline-flex items-center gap-1">
        {freeBadge}
        <Badge tone="rose">Trừ lương {f(wageDays)}d</Badge>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      {freeBadge}
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
      <span className="text-neutral-800">{label}</span>
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

function ProfitSection({ items, total }: { items: EmployeeProfit[]; total: number }) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 overflow-hidden">
      <header className="px-3 py-2.5 border-b border-violet-200/60 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm text-violet-900">Profit từ doanh số</h3>
        <span className="text-xs font-semibold text-violet-700 tabular-nums">
          +{Math.round(total).toLocaleString("en-US")} VND
        </span>
      </header>
      <div className="divide-y divide-violet-100">
        {items.map((item, i) => (
          <div key={i} className="px-3 py-2.5 space-y-1.5">
            {item.role !== "total" && <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-violet-800">{item.channel_name}</span>
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider",
                item.role === "sale" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700",
              )}>
                {item.role.toUpperCase()}
              </span>
              <span className="ml-auto text-xs font-semibold text-violet-700 tabular-nums">
                +{Math.round(item.total_employee_profit).toLocaleString("en-US")}
              </span>
            </div>}
            {item.role === "total" && item.company_total_profit !== undefined && item.total_share_pct !== undefined && (
              <div className="rounded-lg bg-white/60 px-3 py-2.5 text-sm text-neutral-600 flex flex-wrap items-center gap-x-1.5">
                <span>Tổng profit tháng:</span>
                <span className="font-semibold text-violet-800 tabular-nums">
                  {Math.round(item.company_total_profit).toLocaleString("en-US")} VND
                </span>
                <span>× Nhân viên hưởng</span>
                <span className="font-semibold text-violet-800 tabular-nums">
                  {(item.total_share_pct * 100).toFixed(1).replace(/\.0$/, "")}%
                </span>
              </div>
            )}
            {item.details.length > 0 && (
              <table className="w-full text-[11px] text-neutral-600">
                <tbody>
                  {item.details.slice().sort((a, b) => a.brand.localeCompare(b.brand, "vi")).map((d, j) => (
                    <tr key={j} className="border-t border-violet-100/60">
                      <td className="py-1 pr-2">{d.brand}</td>
                      <td className="py-1 pr-2 text-neutral-500">{d.customer_group}</td>
                      <td className="py-1 pr-2 text-neutral-500 tabular-nums">
                        DT: {Math.round(d.revenue).toLocaleString("en-US")}
                      </td>
                      <td className="py-1 pr-2 text-neutral-500">
                        ×{(d.profit_pct * 100).toFixed(1).replace(/\.0$/, "")}%
                      </td>
                      <td className="py-1 pr-2 text-neutral-500">
                        ×{(d.share_pct * 100).toFixed(0)}%
                      </td>
                      <td className="py-1 text-right tabular-nums font-medium text-violet-700">
                        +{Math.round(d.employee_profit).toLocaleString("en-US")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AdjustmentsSection({
  adjustments,
  employeeId,
  monthStr,
  addAdjustment,
  removeAdjustment,
}: {
  adjustments: PayrollAdjustment[];
  employeeId: string;
  monthStr: string;
  addAdjustment: AdjustmentAction;
  removeAdjustment: AdjustmentAction;
}) {
  return (
    <>
      {adjustments.map((a) => (
        <div key={a.id} className="flex items-center gap-2 py-0.5">
          <span className="flex-1 text-sm text-emerald-900">{a.label}</span>
          <span className={`tabular-nums font-semibold text-sm ${a.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {a.amount >= 0 ? "+" : "−"}{Math.abs(Math.round(a.amount)).toLocaleString("en-US")}
          </span>
          <ConfirmForm action={removeAdjustment} message="Xoá khoản điều chỉnh này?">
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="employee_id" value={employeeId} />
            <button
              type="submit"
              title="Xoá khoản này"
              className="h-6 w-6 rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center"
            >
              <Trash2 size={12} />
            </button>
          </ConfirmForm>
        </div>
      ))}
      <details className="mt-1 group">
        <summary className="text-xs text-emerald-700 hover:text-emerald-900 cursor-pointer select-none w-fit list-none [&::-webkit-details-marker]:hidden">
          + Thêm khoản
        </summary>
        <form action={addAdjustment} className="flex gap-1.5 pt-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="month" value={monthStr} />
          <input
            type="text"
            name="label"
            placeholder="Mô tả (vd: Thưởng KPI)"
            required
            className="h-8 flex-1 min-w-0 rounded-lg border border-emerald-200 bg-white/70 px-2.5 text-xs outline-none focus:border-emerald-400 placeholder:text-neutral-400"
          />
          <input
            type="number"
            name="amount"
            placeholder="Số tiền"
            required
            className="h-8 w-32 rounded-lg border border-emerald-200 bg-white/70 px-2.5 text-xs tabular-nums outline-none focus:border-emerald-400 placeholder:text-neutral-400"
          />
          <button
            type="submit"
            className="h-8 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 shrink-0 transition"
          >
            Thêm
          </button>
        </form>
      </details>
    </>
  );
}
