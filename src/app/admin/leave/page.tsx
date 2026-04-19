import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { LEAVE_CATEGORIES, type LeaveCategory } from "@/types/db";
import { Inbox, Trash2, Calendar, Tag } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

export const dynamic = "force-dynamic";

async function deleteLeave(formData: FormData) {
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

  const id = String(formData.get("id"));
  await createAdminClient().from("leave_requests").delete().eq("id", id);
  revalidatePath("/admin/leave");
  revalidatePath("/admin");
}

type Row = {
  id: string;
  leave_date: string;
  category: LeaveCategory;
  duration: number;
  duration_unit: "day" | "hour";
  reason: string | null;
  created_at: string;
  employees: { name: string; email: string } | null;
};

export default async function AdminLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();

  const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 30 * 86400_000);
  const to = sp.to ? new Date(sp.to) : new Date(Date.now() + 30 * 86400_000);

  let query = admin
    .from("leave_requests")
    .select("id, leave_date, category, duration, duration_unit, reason, created_at, employees(name, email)")
    .gte("leave_date", from.toISOString().slice(0, 10))
    .lte("leave_date", to.toISOString().slice(0, 10))
    .order("leave_date", { ascending: false })
    .limit(500);
  if (sp.category) query = query.eq("category", sp.category);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Lịch sử xin nghỉ</h1>

      <form action="/admin/leave" className="flex flex-wrap gap-2 rounded-2xl border border-white/60 glass p-3">
        <FilterInput icon={Calendar} name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} />
        <FilterInput icon={Calendar} name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} />
        <div className="relative flex-1 min-w-[160px]">
          <Tag size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <select
            name="category"
            defaultValue={sp.category ?? ""}
            className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Tất cả danh mục</option>
            {Object.entries(LEAVE_CATEGORIES).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <Button size="sm" type="submit">Lọc</Button>
      </form>

      {rows.length === 0 ? (
        <Empty icon={Inbox} title="Không có đơn xin nghỉ" description="Điều chỉnh bộ lọc hoặc chờ nhân viên gửi." />
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/60 glass p-3 flex gap-3">
                <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Calendar size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.employees?.name ?? "?"}</div>
                      <div className="text-xs text-neutral-500 truncate">{r.employees?.email}</div>
                    </div>
                    <form action={deleteLeave}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button size="sm" variant="danger" type="submit"><Trash2 size={14} /></Button>
                    </form>
                  </div>
                  <div className="mt-1.5 text-xs text-neutral-700">
                    <div className="font-medium">{LEAVE_CATEGORIES[r.category]}</div>
                    <div className="text-neutral-500 mt-0.5">
                      {format(new Date(r.leave_date), "d/M/yyyy", { locale: vi })} · {r.duration}{" "}
                      {r.duration_unit === "day" ? "ngày" : "giờ"}
                    </div>
                    {r.reason && <div className="text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-2xl border border-white/60 glass overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-neutral-50/80 text-left">
                <tr>
                  <th className="p-3 font-medium text-neutral-500">Nhân viên</th>
                  <th className="p-3 font-medium text-neutral-500">Ngày</th>
                  <th className="p-3 font-medium text-neutral-500">Danh mục</th>
                  <th className="p-3 font-medium text-neutral-500">Thời gian</th>
                  <th className="p-3 font-medium text-neutral-500">Lý do</th>
                  <th className="p-3 font-medium text-neutral-500">Nộp lúc</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/60">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <div className="font-medium">{r.employees?.name ?? "?"}</div>
                      <div className="text-xs text-neutral-500">{r.employees?.email}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">{format(new Date(r.leave_date), "d/M/yyyy", { locale: vi })}</td>
                    <td className="p-3">{LEAVE_CATEGORIES[r.category]}</td>
                    <td className="p-3 whitespace-nowrap">
                      {r.duration} {r.duration_unit === "day" ? "ngày" : "giờ"}
                    </td>
                    <td className="p-3 text-neutral-600 max-w-sm">
                      <div className="line-clamp-2">{r.reason ?? "—"}</div>
                    </td>
                    <td className="p-3 text-neutral-500 whitespace-nowrap">
                      {format(new Date(r.created_at), "dd/MM HH:mm", { locale: vi })}
                    </td>
                    <td className="p-3">
                      <form action={deleteLeave}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button size="sm" variant="danger" type="submit"><Trash2 size={14} /></Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function FilterInput({
  icon: Icon,
  ...rest
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Icon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        className="h-9 rounded-lg border border-neutral-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-neutral-900"
        {...rest}
      />
    </div>
  );
}
