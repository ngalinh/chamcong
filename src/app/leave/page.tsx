import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LeaveRequestForm from "@/components/LeaveRequestForm";
import { Empty } from "@/components/ui/Empty";
import { LEAVE_CATEGORIES, type LeaveRequest } from "@/types/db";
import { ArrowLeft, Calendar, Inbox } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!employee) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p>Tài khoản chưa được enroll. Liên hệ admin.</p>
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: history } = await admin
    .from("leave_requests")
    .select("*")
    .eq("employee_id", employee.id)
    .order("leave_date", { ascending: false })
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
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">Nghỉ phép</p>
          <h1 className="text-2xl font-semibold tracking-tight">Xin nghỉ</h1>
        </div>
      </header>

      <LeaveRequestForm employeeName={employee.name} employeeEmail={employee.email} />

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400 mb-2">Lịch sử gần đây</h2>
        <div className="rounded-2xl glass border border-white/60 overflow-hidden divide-y divide-neutral-200/60">
          {history?.length ? (
            (history as LeaveRequest[]).map((r) => (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Calendar size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{LEAVE_CATEGORIES[r.category]}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {format(new Date(r.leave_date), "EEEE, d 'tháng' M yyyy", { locale: vi })} · {r.duration}{" "}
                    {r.duration_unit === "day" ? "ngày" : "giờ"}
                  </div>
                  {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
                </div>
              </div>
            ))
          ) : (
            <Empty icon={Inbox} title="Chưa có đơn nào" description="Đơn xin nghỉ của bạn sẽ hiện ở đây." />
          )}
        </div>
      </section>
    </main>
  );
}
