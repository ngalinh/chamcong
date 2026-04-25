import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NotificationToggle } from "@/components/NotificationToggle";
import { MonthlyStatsCards } from "@/components/MonthlyStatsCards";
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
  Timer,
  Wifi,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { formatVN } from "@/lib/time";
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

  if (!employee) redirect("/enroll");

  // Admin: PWA launch / direct visit / từ login → /admin.
  // Nếu click logo từ trong app (referer same-origin) → cho xem home nhân viên.
  if (employee.is_admin || isAdminEmail(user.email)) {
    const h = await headers();
    const referer = h.get("referer") ?? "";
    const host = h.get("host") ?? "";
    let fromInsideApp = false;
    try {
      const refUrl = new URL(referer);
      if (refUrl.host === host) fromInsideApp = true;
    } catch {
      // referer rỗng hoặc không parse được → entrypoint
    }
    if (!fromInsideApp) redirect("/admin");
  }

  // Nhân viên Làm online (chi nhánh remote) không cần enroll khuôn mặt
  let isRemoteEmployee = false;
  if (employee.home_office_id) {
    const { data: home } = await admin
      .from("offices")
      .select("is_remote")
      .eq("id", employee.home_office_id)
      .maybeSingle();
    isRemoteEmployee = !!home?.is_remote;
  }
  if (!employee.face_descriptor && !isRemoteEmployee) redirect("/enroll");

  const sevenDaysAgo = new Date(Date.now() - 14 * 86400_000).toISOString();

  // Phạm vi tháng hiện tại theo giờ VN — dùng cho thống kê
  const nowForRange = new Date();
  const monthStartVN = new Date(`${formatVN(nowForRange, "yyyy-MM")}-01T00:00:00+07:00`);
  const monthStartIso = monthStartVN.toISOString();
  const monthStartDate = formatVN(monthStartVN, "yyyy-MM-dd");

  const [
    { data: lastCheckIn },
    { data: recentLeaves },
    { data: lateEarly },
    { data: lateMonthList },
    { data: monthLeaves },
  ] = await Promise.all([
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
    admin
      .from("check_ins")
      .select("id, checked_in_at, late_minutes, offices(name)")
      .eq("employee_id", employee.id)
      .eq("kind", "in")
      .gt("late_minutes", 5)
      .gte("checked_in_at", monthStartIso)
      .order("checked_in_at", { ascending: false }),
    admin
      .from("leave_requests")
      .select("id, leave_date, category, duration, duration_unit, status")
      .eq("employee_id", employee.id)
      .gte("leave_date", monthStartDate)
      .order("leave_date", { ascending: false }),
  ]);

  const lateMonthCount = lateMonthList?.length ?? 0;
  const lateItems = (lateMonthList ?? []).map((r) => ({
    id: r.id,
    at: r.checked_in_at as string,
    // @ts-expect-error — supabase join
    office: (r.offices?.name ?? null) as string | null,
    minutes: r.late_minutes ?? 0,
  }));

  const onlineItems = (monthLeaves ?? [])
    .filter((l) => String(l.category).startsWith("online_"))
    .map((l) => ({
      id: l.id,
      leave_date: l.leave_date as string,
      category: l.category as LeaveCategory,
      duration: l.duration as number,
      duration_unit: l.duration_unit as "day" | "hour",
      status: l.status as LeaveStatus,
    }));
  const offItems = (monthLeaves ?? [])
    .filter((l) => String(l.category).startsWith("leave_"))
    .map((l) => ({
      id: l.id,
      leave_date: l.leave_date as string,
      category: l.category as LeaveCategory,
      duration: l.duration as number,
      duration_unit: l.duration_unit as "day" | "hour",
      status: l.status as LeaveStatus,
    }));
  const onlineMonthCount = onlineItems.length;
  const offMonthCount = offItems.length;

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

  const now = new Date();
  const hour = parseInt(formatVN(now, "H"), 10);
  const greeting = hour < 12 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const nowLabel = formatVN(now, "HH:mm · EEEE, d 'tháng' M, yyyy");

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
          <p className="text-xs text-neutral-500 mt-0.5 first-letter:uppercase tabular-nums">{nowLabel}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="h-10 w-10 rounded-full glass border border-white/60 flex items-center justify-center text-neutral-500 hover:text-neutral-900">
            <LogOut size={18} />
          </button>
        </form>
      </header>

      <div className="relative flex-1 flex flex-col gap-6 max-w-md w-full mx-auto py-6">
        <div className="grid grid-cols-2 gap-2.5">
          <ActionTile href="/leave"      Icon={CalendarOff} title="Xin nghỉ"  subtitle="WFH, trừ phép"   tone="amber" />
          <ActionTile href="/overtime"   Icon={Timer}       title="Làm OT"    subtitle="Ngoài giờ"        tone="violet" />
          <ActionTile href="/violations" Icon={ShieldAlert} title="Vi phạm"   subtitle="Tự khai, phạt"    tone="rose" />
          <ActionTile href="/history"    Icon={History}     title="Lịch sử"   subtitle="Chấm công"        tone="sky" />
        </div>

        {/* Thống kê tháng — bấm vào card xem chi tiết */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-2 px-1 flex items-center gap-1.5">
            <TrendingUp size={12} /> Trong tháng {formatVN(nowForRange, "M/yyyy")}
          </h2>
          <MonthlyStatsCards
            lateCount={lateMonthCount}
            onlineCount={onlineMonthCount}
            offCount={offMonthCount}
            lateItems={lateItems}
            onlineItems={onlineItems}
            offItems={offItems}
          />
        </section>

        <NotificationToggle />

        {canCheckIn && (
          <Link href="/checkin" className="group block">
            <div className="relative aspect-square w-full rounded-[36px] overflow-hidden shadow-2xl shadow-indigo-500/35 transition group-active:scale-[0.98] animate-breathe">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700" />
              <div className="absolute -top-24 -right-10 h-64 w-64 rounded-full bg-white/15 blur-2xl animate-float" />
              <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-fuchsia-300/20 blur-3xl animate-float" style={{ animationDelay: "-9s" }} />
              <div className="absolute inset-8 rounded-full border border-white/20" />
              <div className="absolute inset-16 rounded-full border border-white/10" />

              <div className="relative h-full flex flex-col items-center justify-center gap-4 text-white">
                <div className="relative h-20 w-20 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-white/30 animate-ping-slow" />
                  <span className="relative h-20 w-20 rounded-full bg-white/15 backdrop-blur ring-1 ring-white/30 flex items-center justify-center">
                    <Fingerprint size={40} strokeWidth={1.5} />
                  </span>
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
                <Link
                  key={`${n.kind}:${n.id}`}
                  href="/history"
                  className="block transition hover:bg-white/70 active:bg-white/80"
                >
                  <NotifRow item={n} />
                </Link>
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

const TILE_TONE = {
  amber:  { iconBg: "bg-amber-50",  iconText: "text-amber-600"  },
  sky:    { iconBg: "bg-sky-50",    iconText: "text-sky-600"    },
  violet: { iconBg: "bg-violet-50", iconText: "text-violet-600" },
  rose:   { iconBg: "bg-rose-50",   iconText: "text-rose-600"   },
} as const;

function ActionTile({
  href, Icon, title, subtitle, tone,
}: {
  href: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  subtitle: string;
  tone: keyof typeof TILE_TONE;
}) {
  const t = TILE_TONE[tone];
  return (
    <Link href={href} className="rounded-2xl glass border border-white/60 p-3 hover:bg-white/80 transition">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-2", t.iconBg, t.iconText)}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <p className="font-medium text-sm leading-tight">{title}</p>
      <p className="text-[11px] text-neutral-500 leading-tight">{subtitle}</p>
    </Link>
  );
}
