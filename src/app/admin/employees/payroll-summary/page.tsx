import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { computePayrollForMonth } from "@/lib/payroll-snapshot";
import { computeProfitForEmployee } from "@/lib/profit";
import { yearMonthVN, parseYearMonth } from "@/lib/workdays";
import { formatVN } from "@/lib/time";
import type { Employee } from "@/types/db";
import { ArrowLeft, ChevronLeft, ChevronRight, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtVnd = (n: number) =>
  `${Math.max(0, Math.round(n)).toLocaleString("en-US")} VND`;

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

  const rows = await Promise.all(
    activeEmployees.map(async (emp) => {
      const { data: snapshotRow } = await admin
        .from("payroll_snapshots")
        .select("data")
        .eq("employee_id", emp.id)
        .eq("year_month", monthStr)
        .maybeSingle();

      const fromSnapshot = !!snapshotRow?.data;
      let total = 0;
      try {
        const payload = snapshotRow?.data
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (snapshotRow.data as any)
          : await computePayrollForMonth(admin, emp, monthStr);

        const otFixed = Number(emp.ot_fixed_salary ?? 0);

        const { data: adjRaw } = await admin
          .from("payroll_adjustments")
          .select("amount")
          .eq("employee_id", emp.id)
          .eq("month", monthStr);
        const adjTotal = (adjRaw ?? []).reduce(
          (s: number, a: { amount: unknown }) => s + Number(a.amount),
          0,
        );

        const profitTotal = fromSnapshot
          ? 0
          : (await computeProfitForEmployee(emp.id, monthStr)).total;

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

      return { emp, total };
    }),
  );

  rows.sort((a, b) => {
    const aA = a.emp.is_admin ? 1 : 0;
    const bA = b.emp.is_admin ? 1 : 0;
    if (aA !== bA) return bA - aA;
    return a.emp.name.localeCompare(b.emp.name, "vi");
  });

  const grandSum = rows.reduce((s, r) => s + Math.max(0, r.total), 0);

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

      {/* Employee list — dùng list thay table để tránh overflow trên mobile */}
      <div className="rounded-2xl border border-white/60 glass overflow-hidden">
        <div className="px-4 py-2.5 border-b border-neutral-200/60 bg-white/40 flex items-center gap-3">
          <span className="flex-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Nhân viên
          </span>
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider shrink-0">
            Lương tháng {monthLabel}
          </span>
          <span className="w-10" />
        </div>

        <div className="divide-y divide-neutral-200/60">
          {rows.map(({ emp, total }) => (
            <div key={emp.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/40 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-neutral-900 truncate">
                  {emp.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-xs text-neutral-500 truncate">
                    {emp.email}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                      emp.employment_type === "parttime"
                        ? "bg-violet-50 text-violet-700"
                        : "bg-sky-50 text-sky-700"
                    }`}
                  >
                    {emp.employment_type === "parttime" ? "PT" : "FT"}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-semibold tabular-nums text-emerald-700 text-sm whitespace-nowrap">
                  {fmtVnd(total)}
                </span>
              </div>
              <div className="shrink-0 w-10 text-right">
                <Link
                  href={`/admin/employees/${emp.id}/payroll?month=${monthStr}&from=summary`}
                  className="text-xs text-sky-600 hover:text-sky-800"
                >
                  →
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-neutral-200 bg-emerald-50/60 flex items-center gap-3">
          <span className="flex-1 font-semibold text-neutral-700 text-sm">
            Tổng cộng
          </span>
          <span className="font-bold tabular-nums text-emerald-800 text-sm whitespace-nowrap">
            {fmtVnd(grandSum)}
          </span>
          <span className="w-10" />
        </div>
      </div>
    </div>
  );
}
