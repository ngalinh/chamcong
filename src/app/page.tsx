import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NotificationToggle } from "@/components/NotificationToggle";
import {
  Fingerprint,
  LogOut,
  Shield,
  CheckCircle2,
  ArrowRight,
  CalendarOff,
  History,
  Bell,
  Check,
  X,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { LEAVE_CATEGORIES, type LeaveCategory, type LeaveStatus, type CheckInKind } from "@/types/db";

export const dynamic = "force-dynamic";

type NotifItem =
  | {
      kind: "leave_decision";
      id: string;
      at: string;
      status: "approved" | "rejected";
      leave_date: string;
      category: LeaveCategory;
      approved_by: string | null;
    }
  | {
      kind: "late" | "early";
      id: string;
      at: string;
      minutes: number;
      office: string | null;
      check_kind: CheckInKind;
    };

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();

  if (!employee || !employee.face_descriptor) redirect("/enroll");

  const sevenDaysAgo = new Date(Date.now() - 14 * 86400_000).toISOString();

  const [{ data: lastCheckIn }, { data: recentLeaves }, { data: lateEarly }] = await Promise.all([
    admin
      .from("check_ins")
      .select("checked_in_at, offices(name)")
      .eq("employee_id", employee.id)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("leave_requests")
      .select("id, status, leave_date, category, approved_at, approved_by")
      .eq("employee_id", employee.id)
      .neq("status", "pending")
      .gte("approved_at", sevenDaysAgo)
      .order("approved_at", { ascending: false })
      .limit(5),
    admin
      .from("check_ins")
      .select("id, kind, checked_in_at, late_minutes, early_minutes, offices(name)")
      .eq("employee_id", employee.id)
      .gte("checked_in_at", sevenDaysAgo)
      .or("late_minutes.gt.5,early_minutes.gt.5")
      .order("checked_in_at", { ascending: false })
      .limit(5),
  ]);

  const notifications: NotifItem[] = [
    ...(recentLeaves ?? []).map((r): NotifItem => ({
      kind: "leave_decision",
      id: r.id,
      at: r.approved_at as string,
      status: r.status as "approved" | "rejected",
      leave_date: r.leave_date,
      category: r.category,
      approved_by: r.approved_by,
    })),
    ...(lateEarly ?? []).flatMap((r): NotifItem[] => {
      const out: NotifItem[] = [];
      if ((r.late_minutes ?? 0) > 5 && r.kind === "in") {
        out.push({
          kind: "late",
          id: `late-${r.id}`,
          at: r.checked_in_at as string,
          minutes: r.late_minutes ?? 0,
          // @ts-expect-error — join
          office: r.offices?.name ?? null,
          check_kind: "in",
        });
      }
      if ((r.early_minutes ?? 0) > 5 && r.kind === "out") {
        out.push({
          kind: "early",
          id: `early-${r.id}`,
          at: r.checked_in_at as string,
          minutes: r.early_minutes ?? 0,
          // @ts-expect-error — join
          office: r.offices?.name ?? null,
          check_kind: "out",
        });
      }
      return out;
    }),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  const isAdmin = isAdminEmail(user.email) || employee?.is_admin;
  const canCheckIn = true;
  // @ts-expect-error — supabase join
  const lastOfficeName: string | undefined = lastCheckIn?.offices?.name;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";

  return (
    <main className="relative min-h-dvh flex flex-col px-safe pt-safe pb-safe overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-indigo-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-purple-300/20 blur-3xl" />

      <header className="relative flex items-center justify-between py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">{greeting}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {employee?.name ?? user.email?.split("@")[0]}
          </h1>
        </div>
        <form action="/auth/signout" method="post">
          <button className="h-10 w-10 rounded-full glass border border-white/60 flex items-center justify-center text-neutral-500 hover:text-neutral-900">
            <LogOut size={18} />
          </button>
        </form>
      </header>

      <div className="relative flex-1 flex flex-col gap-6 max-w-md w-full mx-auto py-6">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/leave"
            className="rounded-2xl glass border border-white/60 p-4 hover:bg-white/80 transition"
          >
            <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
              <CalendarOff size={20} strokeWidth={1.8} />
            </div>
            <p className="font-medium">Xin nghỉ</p>
            <p className="text-xs text-neutral-500">WFH, trừ phép…</p>
          </Link>
          <Link
            href="/history"
            className="rounded-2xl glass border border-white/60 p-4 hover:bg-white/80 transition"
          >
            <div className="h-11 w-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-2">
              <History size={20} strokeWidth={1.8} />
            </div>
            <p className="font-medium">Lịch sử</p>
            <p className="text-xs text-neutral-500">Chấm công, xin nghỉ</p>
          </Link>
        </div>

        <NotificationToggle />

        {canCheckIn && (
          <Link href="/checkin" className="group block">
            <div className="relative aspect-square w-full rounded-[36px] overflow-hidden shadow-2xl shadow-indigo-500/40 transition group-active:scale-[0.98]">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-800" />
              <div className="absolute -top-24 -right-10 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
              <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-fuchsia-300/20 blur-3xl" />
              <div className="absolute inset-8 rounded-full border border-white/20" />
              <div className="absolute inset-16 rounded-full border border-white/10" />

              <div className="relative h-full flex flex-col items-center justify-center gap-4 text-white">
                <div className="h-20 w-20 rounded-full bg-white/15 backdrop-blur ring-1 ring-white/30 flex items-center justify-center">
                  <Fingerprint size={40} strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold tracking-tight">Chấm công ngay</p>
                  <p className="text-sm text-white/70 mt-0.5">Chạm để bắt đầu</p>
                </div>
              </div>
            </div>
          </Link>
        )}

        {lastCheckIn && (
          <div className="rounded-2xl glass border border-white/60 shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/30">
              <CheckCircle2 size={20} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">Chấm công gần nhất</p>
              <p className="text-sm font-medium truncate">
                {lastOfficeName ?? "—"} ·{" "}
                {formatDistanceToNow(new Date(lastCheckIn.checked_in_at), { addSuffix: true, locale: vi })}
              </p>
            </div>
          </div>
        )}

        {/* ============ Thông báo gần đây ============ */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 flex items-center gap-1.5">
              <Bell size={12} /> Thông báo gần đây
            </h2>
            {notifications.length > 0 && (
              <Link href="/history" className="text-xs text-indigo-600 font-medium hover:underline">
                Xem tất cả →
              </Link>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="rounded-2xl glass border border-white/60 p-4 text-sm text-neutral-500 text-center">
              Chưa có thông báo mới
            </div>
          ) : (
            <div className="rounded-2xl glass border border-white/60 overflow-hidden divide-y divide-neutral-200/60">
              {notifications.map((n) => (
                <NotifRow key={`${n.kind}:${n.id}`} item={n} />
              ))}
            </div>
          )}
        </section>
      </div>

      {isAdmin && (
        <div className="relative py-6 max-w-md w-full mx-auto">
          <Link href="/admin">
            <Button variant="secondary" size="lg" className="w-full bg-white/70 backdrop-blur">
              <Shield size={18} /> Vào trang quản trị
              <ArrowRight size={16} className="ml-auto" />
            </Button>
          </Link>
        </div>
      )}
    </main>
  );
}

function NotifRow({ item: n }: { item: NotifItem }) {
  if (n.kind === "leave_decision") {
    const ok = n.status === "approved";
    return (
      <div className="p-3 flex items-center gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            ok ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
          )}
        >
          {ok ? <Check size={18} /> : <X size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            Đơn xin nghỉ {ok ? "đã được duyệt" : "bị từ chối"}
          </p>
          <p className="text-xs text-neutral-500 truncate">
            {LEAVE_CATEGORIES[n.category]} · {formatDistanceToNow(new Date(n.at), { addSuffix: true, locale: vi })}
          </p>
        </div>
      </div>
    );
  }

  const isLate = n.kind === "late";
  return (
    <div className="p-3 flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
        {isLate ? <Clock size={18} /> : <AlertTriangle size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {isLate ? `Đi làm muộn ${n.minutes} phút` : `Về sớm ${n.minutes} phút`}
        </p>
        <p className="text-xs text-neutral-500 truncate">
          {n.office ?? "—"} · {formatDistanceToNow(new Date(n.at), { addSuffix: true, locale: vi })}
        </p>
      </div>
    </div>
  );
}
