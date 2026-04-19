import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import {
  Users,
  Fingerprint,
  Building2,
  ArrowRight,
  Inbox,
  AlertTriangle,
  Bell,
  CalendarOff,
  CheckCircle2,
} from "lucide-react";
import { Empty } from "@/components/ui/Empty";
import { RunAuditButton } from "@/components/RunAuditButton";
import { LEAVE_CATEGORIES } from "@/types/db";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { formatVN } from "@/lib/time";

export const dynamic = "force-dynamic";

type ActivityItem =
  | {
      kind: "checkin";
      id: string;
      at: string;
      employee: { name: string; email: string } | null;
      office: string | null;
      score: number | null;
    }
  | {
      kind: "leave";
      id: string;
      at: string;
      employee: { name: string; email: string } | null;
      category: keyof typeof LEAVE_CATEGORIES;
      duration: number;
      duration_unit: "day" | "hour";
      leave_date: string;
    };

export default async function AdminHome() {
  const admin = createAdminClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [
    { count: empCount },
    { count: todayCount },
    { data: offices },
    { data: recentCheckIns },
    { data: recentLeaves },
    { data: alerts },
  ] = await Promise.all([
    admin.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
    admin.from("check_ins").select("*", { count: "exact", head: true }).gte("checked_in_at", todayIso),
    admin.from("offices").select("id, name").eq("is_active", true).order("name"),
    admin
      .from("check_ins")
      .select("id, checked_in_at, face_match_score, employees(name, email), offices(name)")
      .order("checked_in_at", { ascending: false })
      .limit(8),
    admin
      .from("leave_requests")
      .select("id, created_at, leave_date, category, duration, duration_unit, employees(name, email)")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("alerts")
      .select("id, alert_date, message, employees(name, email)")
      .eq("resolved", false)
      .order("alert_date", { ascending: false })
      .limit(15),
  ]);

  const perOffice: { id: string; name: string; count: number }[] = [];
  for (const o of offices ?? []) {
    const { count } = await admin
      .from("check_ins")
      .select("*", { count: "exact", head: true })
      .eq("office_id", o.id)
      .gte("checked_in_at", todayIso);
    perOffice.push({ id: o.id, name: o.name, count: count ?? 0 });
  }

  // Merge + sort notifications (check-ins + leave requests) theo thời gian gần nhất
  const notifications: ActivityItem[] = [
    ...(recentCheckIns ?? []).map((r): ActivityItem => ({
      kind: "checkin",
      id: r.id,
      at: r.checked_in_at as string,
      // @ts-expect-error — supabase join
      employee: r.employees,
      // @ts-expect-error — supabase join
      office: r.offices?.name ?? null,
      score: r.face_match_score,
    })),
    ...(recentLeaves ?? []).map((r): ActivityItem => ({
      kind: "leave",
      id: r.id,
      at: r.created_at as string,
      // @ts-expect-error — supabase join
      employee: r.employees,
      category: r.category,
      duration: r.duration,
      duration_unit: r.duration_unit,
      leave_date: r.leave_date,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">Quản trị</p>
        <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
      </div>

      {/* Hero stat */}
      <section className="relative rounded-3xl overflow-hidden p-6 text-white shadow-xl shadow-indigo-500/30">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700" />
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-fuchsia-300/15 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-white/70 font-medium flex items-center gap-1.5">
              <Fingerprint size={14} /> Check-in hôm nay
            </p>
            <p className="text-5xl font-semibold tabular-nums mt-2 tracking-tight">{todayCount ?? 0}</p>
            <p className="text-sm text-white/70 mt-1">
              trên tổng <b className="text-white">{empCount ?? 0}</b> nhân viên
            </p>
          </div>
          <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/30 hidden sm:flex items-center justify-center">
            <Users size={26} />
          </div>
        </div>
      </section>

      {/* Per-office */}
      {perOffice.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400 mb-3">Theo chi nhánh</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {perOffice.map((o) => (
              <div key={o.id} className="rounded-2xl glass border border-white/60 p-4">
                <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
                  <Building2 size={14} className="text-indigo-500" />
                  <span className="truncate font-medium text-neutral-700">{o.name}</span>
                </div>
                <div className="text-3xl font-semibold tabular-nums">{o.count}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Alerts */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Alert</h2>
            {alerts && alerts.length > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-500 text-white">
                {alerts.length}
              </span>
            )}
          </div>
          <RunAuditButton />
        </div>

        <div className="rounded-2xl overflow-hidden border border-rose-100/50 bg-rose-50/40 backdrop-blur divide-y divide-rose-100/60">
          {alerts?.length ? (
            alerts.map((a) => {
              // @ts-expect-error — supabase join
              const emp = a.employees as { name: string; email: string } | null;
              return (
                <div key={a.id} className="p-3 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{emp?.name ?? "?"}</div>
                    <div className="text-xs text-neutral-600">
                      Vắng ngày {formatVN(a.alert_date + "T00:00:00+07:00", "EEEE, d 'tháng' M")} —{" "}
                      không chấm công, không có đơn xin nghỉ
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-sm text-emerald-700 flex flex-col items-center gap-2">
              <CheckCircle2 size={24} className="text-emerald-500" />
              Không có alert nào. Tất cả nhân viên đều có chấm công hoặc có đơn xin nghỉ.
            </div>
          )}
        </div>
      </section>

      {/* Notifications — unified feed */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Notification</h2>
            <Bell size={12} className="text-neutral-400" />
          </div>
          <Link href="/admin/history" className="text-xs font-medium text-indigo-600 hover:underline flex items-center gap-0.5">
            Xem tất cả <ArrowRight size={12} />
          </Link>
        </div>
        <div className="rounded-2xl glass border border-white/60 overflow-hidden divide-y divide-neutral-200/60">
          {notifications.length ? (
            notifications.map((n) => <NotificationRow key={`${n.kind}:${n.id}`} item={n} />)
          ) : (
            <Empty icon={Inbox} title="Chưa có hoạt động" />
          )}
        </div>
      </section>
    </div>
  );
}

function NotificationRow({ item }: { item: ActivityItem }) {
  const emp = item.employee;
  if (item.kind === "checkin") {
    return (
      <div className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Fingerprint size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">
            {emp?.name ?? "?"} <span className="text-neutral-500 font-normal">đã chấm công</span>
          </div>
          <div className="text-xs text-neutral-500 truncate">
            {item.office ?? "—"} · {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: vi })}
          </div>
        </div>
        {item.score != null && (
          <span className={`text-[10px] font-medium px-2 py-1 rounded-full border ${item.score < 0.5 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
            {item.score.toFixed(2)}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
        <CalendarOff size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">
          {emp?.name ?? "?"} <span className="text-neutral-500 font-normal">xin nghỉ</span>{" "}
          <span className="text-neutral-700">{LEAVE_CATEGORIES[item.category]}</span>
        </div>
        <div className="text-xs text-neutral-500 truncate">
          {formatVN(item.leave_date + "T00:00:00+07:00", "d/M")} · {item.duration}{" "}
          {item.duration_unit === "day" ? "ngày" : "giờ"} ·{" "}
          {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: vi })}
        </div>
      </div>
    </div>
  );
}
