import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { computePayrollForMonth } from "@/lib/payroll-snapshot";
import { computeProfitForEmployee } from "@/lib/profit";
import { yearMonthVN, parseYearMonth } from "@/lib/workdays";
import { formatVN } from "@/lib/time";
import type { Employee } from "@/types/db";
import { ArrowLeft, ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { CkCongTyEditor } from "@/components/CkCongTyEditor";

export const dynamic = "force-dynamic";

const fmtVnd = (n: number) =>
  `${Math.max(0, Math.round(n)).toLocaleString("en-US")} VND`;

async function saveTransfer(formData: FormData) {
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
  const ckCongTy = Math.round(Number(String(formData.get("ck_cong_ty") ?? "0").replace(/\D/g, "") || "0"));

  if (!employeeId || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Dữ liệu không hợp lệ");

  const admin = createAdminClient();
  const { error } = await admin
    .from("payroll_transfers")
    .upsert(
      { employee_id: employeeId, month, ck_cong_ty: ckCongTy, updated_at: new Date().toISOString() },
      { onConflict: "employee_id,month" },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/admin/employees/payroll-summary");
}

export default async function PayrollSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) redirect("/");

  const monthStr =
    sp.month && parseYearMonth(sp.month) ? sp.month : yearMonthVN();
  const ym = parseYearMonth(monthStr)!;

  const admin = createAdminClient();
  const { data: employees } = await admin
    .from("employees")
    .select("*")
    .or("user_id.not.is.null,is_active.eq.true")
    .order("created_at", { ascending: false });

  const activeEmployees = ((employees ?? []) as Employee[]).filter(
    (e) => e.is_active !== false,
  );

  // Fetch existing CK công ty values for this month
  const { data: transfersRaw } = await admin
    .from("payroll_transfers")
    .select("employee_id, ck_cong_ty")
    .eq("month", monthStr);
  const transferMap = new Map<string, number>(
    (transfersRaw ?? []).map((t) => [t.employee_id, Number(t.ck_cong_ty)]),
  );

  const rows = await Promise.all(
    activeEmployees.map(async (emp) => {
      const { data: snapshotRow } = await admin
        .from("payroll_snapshots")
        .select("data")
        .eq("employee_id", emp.id)
        .eq("year_month", monthStr)
        .maybeSingle();

      let total = 0;
      try {
        const payload = snapshotRow?.data
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (snapshotRow.data as any)
          : await computePayrollForMonth(admin, emp, monthStr);

        const otFixed =
          emp.ot_fixed_salary_pending_month && emp.ot_fixed_salary_pending_month <= monthStr
            ? Number(emp.ot_fixed_salary_pending ?? 0)
            : Number(emp.ot_fixed_salary ?? 0);

        const { data: adjRaw } = await admin
          .from("payroll_adjustments")
          .select("amount")
          .eq("employee_id", emp.id)
          .eq("month", monthStr);
        const adjTotal = (adjRaw ?? []).reduce(
          (s: number, a: { amount: unknown }) => s + Number(a.amount),
          0,
        );

        // Profit luôn tính live: cleanup-history không xoá profit_channels/profit_rules/order_data,
        // chỉ xoá data chấm công — nên snapshot (dữ liệu chấm công cũ) không ảnh hưởng tới profit.
        const profitTotal = (await computeProfitForEmployee(emp.id, monthStr)).total;

        if (payload.kind === "fulltime") {
          const r = payload.result;
          total =
            r.salary -
            r.grandTotal +
            r.totalSelfBonus +
            r.totalOTPay +
            otFixed +
            profitTotal +
            adjTotal;
        } else {
          const r = payload.result;
          total = r.grandEarning + otFixed + profitTotal + adjTotal;
        }
      } catch {
        total = 0;
      }

      return { emp, total, ckCongTy: transferMap.get(emp.id) ?? 0 };
    }),
  );

  rows.sort((a, b) => {
    const aA = a.emp.is_admin ? 1 : 0;
    const bA = b.emp.is_admin ? 1 : 0;
    if (aA !== bA) return bA - aA;
    return a.emp.name.localeCompare(b.emp.name, "vi");
  });

  const grandSum = rows.reduce((s, r) => s + Math.max(0, r.total), 0);
  const grandCkCongTy = rows.reduce((s, r) => s + r.ckCongTy, 0);
  const grandCkCaNhan = rows.reduce(
    (s, r) => s + Math.max(0, Math.max(0, r.total) - r.ckCongTy),
    0,
  );

  const prev =
    ym.month === 1
      ? { y: ym.year - 1, m: 12 }
      : { y: ym.year, m: ym.month - 1 };
  const next =
    ym.month === 12
      ? { y: ym.year + 1, m: 1 }
      : { y: ym.year, m: ym.month + 1 };
  const prevHref = `/admin/employees/payroll-summary?month=${prev.y}-${String(prev.m).padStart(2, "0")}`;
  const nextHref = `/admin/employees/payroll-summary?month=${next.y}-${String(next.m).padStart(2, "0")}`;
  const monthLabel = formatVN(`${monthStr}-01T00:00:00+07:00`, "MM/yyyy");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/employees"
          className="h-9 w-9 rounded-full hover:bg-white/50 flex items-center justify-center text-neutral-600"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">
            Quản trị viên
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tổng kết lương
          </h1>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between rounded-xl border border-white/60 glass p-2">
        <Link
          href={prevHref}
          className="h-9 w-9 rounded-lg hover:bg-white/70 flex items-center justify-center text-neutral-600"
        >
          <ChevronLeft size={18} />
        </Link>
        <form
          action="/admin/employees/payroll-summary"
          className="flex items-center gap-2"
        >
          <input
            type="month"
            name="month"
            key={monthStr}
            defaultValue={monthStr}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
          />
          <button
            type="submit"
            className="h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm font-medium hover:bg-neutral-50"
          >
            Xem
          </button>
        </form>
        <Link
          href={nextHref}
          className="h-9 w-9 rounded-lg hover:bg-white/70 flex items-center justify-center text-neutral-600"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <Wallet size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-emerald-700 font-medium uppercase tracking-wider">
            Tổng quỹ lương tháng {monthLabel}
          </p>
          <p className="text-2xl font-bold text-emerald-800 tabular-nums">
            {fmtVnd(grandSum)}
          </p>
          <p className="text-[11px] text-emerald-600 mt-0.5">
            {rows.length} nhân viên · đã bao gồm profit từ doanh số
          </p>
        </div>
      </div>

      {/* Employee list */}
      <div className="rounded-2xl border border-white/60 glass overflow-hidden">
        {/* Table header — desktop only */}
        <div className="hidden sm:grid px-4 py-2.5 border-b border-neutral-200/60 bg-white/40 grid-cols-[minmax(10rem,1fr)_9rem_10rem_9rem] gap-3 items-center">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Nhân viên
          </span>
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right whitespace-nowrap">
            Tổng lương
          </span>
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right whitespace-nowrap">
            CK công ty
          </span>
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right whitespace-nowrap">
            CK cá nhân
          </span>
        </div>

        <div className="divide-y divide-neutral-200/60">
          {rows.map(({ emp, total, ckCongTy }) => {
            const salary = Math.max(0, total);
            const ckCaNhan = Math.max(0, salary - ckCongTy);
            const typeBadge = (
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                  emp.employment_type === "parttime"
                    ? "bg-violet-50 text-violet-700"
                    : "bg-sky-50 text-sky-700"
                }`}
              >
                {emp.employment_type === "parttime" ? "PT" : "FT"}
              </span>
            );
            return (
              <div key={emp.id} className="hover:bg-white/40 transition-colors">
                {/* Mobile card */}
                <div className="sm:hidden px-4 py-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 text-sm truncate">
                        {emp.name}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5 truncate">
                        {emp.email}
                      </div>
                    </div>
                    {typeBadge}
                  </div>
                  {/* Hàng 1: CK công ty (phải) | CK cá nhân */}
                  <div className="grid grid-cols-2 gap-x-3">
                    <div>
                      <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">
                        CK công ty
                      </div>
                      <CkCongTyEditor
                        employeeId={emp.id}
                        month={monthStr}
                        initialCkCongTy={ckCongTy}
                        action={saveTransfer}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">
                        CK cá nhân
                      </div>
                      <div className="font-semibold tabular-nums text-neutral-600 text-sm">
                        {fmtVnd(ckCaNhan)}
                      </div>
                    </div>
                  </div>
                  {/* Hàng 2: Tổng lương + Xem cùng hàng */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">
                        Tổng lương
                      </div>
                      <div className="font-semibold tabular-nums text-emerald-700 text-sm">
                        {fmtVnd(salary)}
                      </div>
                    </div>
                    <Link
                      href={`/admin/employees/${emp.id}/payroll?month=${monthStr}&from=summary`}
                      className="text-xs text-sky-600 hover:text-sky-800 shrink-0"
                    >
                      Xem →
                    </Link>
                  </div>
                </div>

                {/* Desktop table row */}
                <div className="hidden sm:grid px-4 py-3 grid-cols-[minmax(10rem,1fr)_9rem_10rem_9rem] gap-3 items-start">
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900 truncate text-sm">
                      {emp.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-neutral-500 truncate">
                        {emp.email}
                      </span>
                      {typeBadge}
                    </div>
                  </div>
                  <div className="text-right pt-0.5">
                    <span className="font-semibold tabular-nums text-emerald-700 text-sm whitespace-nowrap">
                      {fmtVnd(salary)}
                    </span>
                  </div>
                  <div className="text-right pt-0.5">
                    <CkCongTyEditor
                      employeeId={emp.id}
                      month={monthStr}
                      initialCkCongTy={ckCongTy}
                      action={saveTransfer}
                    />
                  </div>
                  <div className="text-right pt-0.5">
                    <span className="font-semibold tabular-nums text-neutral-600 text-sm whitespace-nowrap">
                      {fmtVnd(ckCaNhan)}
                    </span>
                    <Link
                      href={`/admin/employees/${emp.id}/payroll?month=${monthStr}&from=summary`}
                      className="block text-xs text-sky-600 hover:text-sky-800 mt-0.5"
                    >
                      Xem →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer totals */}
        <div className="border-t border-neutral-200 bg-emerald-50/60">
          {/* Mobile footer */}
          <div className="sm:hidden px-4 py-3 space-y-2">
            <div className="font-semibold text-neutral-700 text-sm">Tổng cộng</div>
            {/* Hàng 1: CK công ty | CK cá nhân */}
            <div className="grid grid-cols-2 gap-x-3">
              <div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">
                  CK công ty
                </div>
                <div className="font-bold tabular-nums text-neutral-700 text-sm">
                  {fmtVnd(grandCkCongTy)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">
                  CK cá nhân
                </div>
                <div className="font-bold tabular-nums text-neutral-700 text-sm">
                  {fmtVnd(grandCkCaNhan)}
                </div>
              </div>
            </div>
            {/* Hàng 2: Tổng lương */}
            <div>
              <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">
                Tổng lương
              </div>
              <div className="font-bold tabular-nums text-emerald-800 text-sm">
                {fmtVnd(grandSum)}
              </div>
            </div>
          </div>
          {/* Desktop footer */}
          <div className="hidden sm:grid px-4 py-3 grid-cols-[minmax(10rem,1fr)_9rem_10rem_9rem] gap-3 items-center">
            <span className="font-semibold text-neutral-700 text-sm">Tổng cộng</span>
            <span className="font-bold tabular-nums text-emerald-800 text-sm whitespace-nowrap text-right">
              {fmtVnd(grandSum)}
            </span>
            <span className="font-bold tabular-nums text-neutral-700 text-sm whitespace-nowrap text-right">
              {fmtVnd(grandCkCongTy)}
            </span>
            <span className="font-bold tabular-nums text-neutral-700 text-sm whitespace-nowrap text-right">
              {fmtVnd(grandCkCaNhan)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
