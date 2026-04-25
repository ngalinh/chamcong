import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ViolationReportForm from "@/components/ViolationReportForm";
import { Empty } from "@/components/ui/Empty";
import type { ViolationReport, ViolationItem, ViolationStatus } from "@/types/db";
import { ArrowLeft, Inbox, AlertTriangle, Check, X, Clock } from "lucide-react";
import { formatVN } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ReportWithItems = ViolationReport & { items: ViolationItem[] };

export default async function ViolationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!employee) redirect("/enroll");

  const admin = createAdminClient();
  const { data: rawReports } = await admin
    .from("violation_reports")
    .select("*, violation_items(id, description, amount, position)")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const reports: ReportWithItems[] = (rawReports ?? []).map((r) => {
    const items = ((r as { violation_items?: ViolationItem[] }).violation_items ?? []).slice();
    items.sort((a, b) => a.position - b.position);
    return { ...(r as ViolationReport), items };
  });

  return (
    <main className="mx-auto max-w-md min-h-dvh px-safe pt-safe pb-safe flex flex-col gap-6">
      <header className="flex items-center gap-2 pt-2">
        <Link
          href="/"
          className="h-10 w-10 rounded-full hover:bg-white/50 flex items-center justify-center text-neutral-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">Tự khai</p>
          <h1 className="text-2xl font-semibold tracking-tight">Vi phạm</h1>
        </div>
      </header>

      <ViolationReportForm />

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400 mb-2">Lịch sử gần đây</h2>
        <div className="flex flex-col gap-2">
          {reports.length ? (
            reports.map((r) => <ReportCard key={r.id} report={r} />)
          ) : (
            <div className="rounded-2xl glass border border-white/60 overflow-hidden">
              <Empty icon={Inbox} title="Chưa có đơn nào" description="Đơn vi phạm của bạn sẽ hiện ở đây." />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function ReportCard({ report: r }: { report: ReportWithItems }) {
  return (
    <div className="rounded-2xl glass border border-white/60 p-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
          <AlertTriangle size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">
              <AlertTriangle size={10} /> Vi phạm
            </span>
            <StatusBadge status={r.status} />
          </div>
          <div className="text-sm font-medium mt-0.5">
            {formatVN(r.report_date + "T00:00:00+07:00", "EEEE, d 'tháng' M yyyy")}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {r.items.length} lỗi · tổng <span className="font-semibold text-rose-700 tabular-nums">{Number(r.total_amount).toLocaleString("vi-VN")} VND</span>
          </div>
        </div>
      </div>
      {r.items.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-neutral-200/60 space-y-1.5">
          {r.items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate text-neutral-700">{it.description}</span>
              <span className="text-rose-700 font-medium tabular-nums shrink-0">
                {Number(it.amount).toLocaleString("vi-VN")} VND
              </span>
            </li>
          ))}
        </ul>
      )}
      {r.reason && (
        <p className="mt-2 pt-2 border-t border-neutral-200/60 text-xs text-neutral-600 line-clamp-2">{r.reason}</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ViolationStatus }) {
  const map = {
    pending:  { label: "Chờ duyệt", cls: "bg-neutral-100 text-neutral-600", Icon: Clock },
    approved: { label: "Đã duyệt",  cls: "bg-emerald-50 text-emerald-700", Icon: Check },
    rejected: { label: "Từ chối",   cls: "bg-rose-50 text-rose-700",       Icon: X },
  }[status];
  const { Icon } = map;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded", map.cls)}>
      <Icon size={10} /> {map.label}
    </span>
  );
}
