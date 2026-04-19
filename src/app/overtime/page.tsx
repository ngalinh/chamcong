import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import OvertimeRequestForm from "@/components/OvertimeRequestForm";
import { Empty } from "@/components/ui/Empty";
import type { OvertimeRequest } from "@/types/db";
import { ArrowLeft, Inbox, Hourglass, Check, X, Clock } from "lucide-react";
import { formatVN } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OvertimePage() {
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
  const { data: history } = await admin
    .from("overtime_requests")
    .select("*")
    .eq("employee_id", employee.id)
    .order("ot_date", { ascending: false })
    .limit(30);

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
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">Overtime</p>
          <h1 className="text-2xl font-semibold tracking-tight">Đăng ký làm OT</h1>
        </div>
      </header>

      <OvertimeRequestForm />

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400 mb-2">Lịch sử gần đây</h2>
        <div className="rounded-2xl glass border border-white/60 overflow-hidden divide-y divide-neutral-200/60">
          {history?.length ? (
            (history as OvertimeRequest[]).map((r) => (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                  <Hourglass size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="font-medium text-sm">
                      {formatVN(r.ot_date + "T00:00:00+07:00", "EEEE, d 'tháng' M")}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                    {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {r.hours} giờ
                  </div>
                  {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
                </div>
              </div>
            ))
          ) : (
            <Empty icon={Inbox} title="Chưa có đơn nào" description="Đơn làm overtime của bạn sẽ hiện ở đây." />
          )}
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: OvertimeRequest["status"] }) {
  const map = {
    pending:  { label: "Chờ duyệt", cls: "bg-neutral-100 text-neutral-600", Icon: Clock },
    approved: { label: "Đã duyệt",  cls: "bg-emerald-50 text-emerald-700", Icon: Check },
    rejected: { label: "Từ chối",    cls: "bg-rose-50 text-rose-700",       Icon: X },
  }[status];
  const { Icon } = map;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded", map.cls)}>
      <Icon size={10} /> {map.label}
    </span>
  );
}
