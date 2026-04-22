import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Bell, ArrowRight } from "lucide-react";

/**
 * Banner ở đầu trang admin: hiện tổng số đơn xin nghỉ + OT đang chờ duyệt
 * (lọc theo branch routing — chỉ tính đơn mà admin hiện tại có quyền duyệt).
 * Click → /admin/history?status=pending
 */
export async function PendingApprovalsBanner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const viewerEmail = user.email.toLowerCase();

  const admin = createAdminClient();
  const [{ data: pendingLeaves }, { data: pendingOT }] = await Promise.all([
    admin
      .from("leave_requests")
      .select("id, employees(home_office_id, offices:home_office_id(approver_email))")
      .eq("status", "pending"),
    admin
      .from("overtime_requests")
      .select("id, employees(home_office_id, offices:home_office_id(approver_email))")
      .eq("status", "pending"),
  ]);

  // Lọc chỉ những đơn admin hiện tại được duyệt (approver_email match hoặc null)
  const canApprove = (rows: { employees?: unknown }[] | null): number => {
    if (!rows) return 0;
    return rows.filter((r) => {
      // @ts-expect-error — supabase nested join
      const approver: string | null = r.employees?.offices?.approver_email ?? null;
      if (!approver) return true; // không có approver_email → mọi admin đều xem
      return approver.toLowerCase() === viewerEmail;
    }).length;
  };

  const leaveCount = canApprove(pendingLeaves);
  const otCount = canApprove(pendingOT);
  const total = leaveCount + otCount;
  if (total === 0) return null;

  const parts: string[] = [];
  if (leaveCount > 0) parts.push(`${leaveCount} xin nghỉ`);
  if (otCount > 0) parts.push(`${otCount} OT`);

  return (
    <Link
      href="/admin/history?status=pending"
      className="block rounded-2xl border border-amber-200 bg-amber-50/90 backdrop-blur p-4 hover:bg-amber-100/80 transition group"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
          <Bell size={18} />
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-amber-50">
            {total}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900">
            Có {total} đơn đang chờ duyệt
          </p>
          <p className="text-xs text-amber-800 mt-0.5">{parts.join(" · ")} — bấm để xem</p>
        </div>
        <ArrowRight size={18} className="text-amber-700 shrink-0 group-hover:translate-x-0.5 transition" />
      </div>
    </Link>
  );
}
