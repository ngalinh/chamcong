import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import {
  LEAVE_CATEGORIES,
  type LeaveCategory,
  type LeaveStatus,
  type OvertimeStatus,
  type ViolationStatus,
  type CheckInKind,
} from "@/types/db";
import {
  ArrowLeft,
  Inbox,
  Fingerprint,
  CalendarOff,
  Calendar,
  Check,
  Clock,
  X,
  MapPin,
  LogIn,
  LogOut,
  Wifi,
  Hourglass,
  ShieldAlert,
} from "lucide-react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { formatVN } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type RowType = "checkin" | "leave" | "violation";

type CheckInRow = {
  type: "checkin";
  id: string;
  at: string;
  kind: CheckInKind;
  office: string | null;
  distance_m: number | null;
  face_match_score: number | null;
  signedUrl: string;
  isRemote: boolean;
};

type LeaveRow = {
  type: "leave";
  id: string;
  at: string;
  leave_date: string;
  category: LeaveCategory;
  duration: number;
  duration_unit: "day" | "hour";
  reason: string | null;
  status: LeaveStatus;
};

type OvertimeRow = {
  type: "overtime";
  id: string;
  at: string;
  ot_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string | null;
  status: OvertimeStatus;
};

type ViolationRow = {
  type: "violation";
  id: string;
  at: string;
  report_date: string;
  total_amount: number;
  itemCount: number;
  reason: string | null;
  status: ViolationStatus;
};

type Row = CheckInRow | LeaveRow | OvertimeRow | ViolationRow;

export default async function MyHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: RowType | "all"; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type ?? "all";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();
  if (!employee) redirect("/enroll");

  // Date range filter — default 30 ngày qua đến hôm nay
  const from = sp.from ? new Date(sp.from + "T00:00:00+07:00") : new Date(Date.now() - 30 * 86400_000);
  const to = sp.to ? new Date(sp.to + "T23:59:59.999+07:00") : new Date();
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const rows: Row[] = [];

  if (type === "all" || type === "checkin") {
    const { data } = await admin
      .from("check_ins")
      .select("id, kind, checked_in_at, distance_m, face_match_score, selfie_path, offices(name, is_remote)")
      .eq("employee_id", employee.id)
      .gte("checked_in_at", fromIso)
      .lte("checked_in_at", toIso)
      .order("checked_in_at", { ascending: false })
      .limit(100);

    const checkIns = data ?? [];
    const paths = checkIns.map((r) => r.selfie_path).filter(Boolean) as string[];
    const signedMap = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signedList } = await admin.storage.from("selfies").createSignedUrls(paths, 3600);
      for (const s of signedList ?? []) {
        if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
      }
    }

    for (const r of checkIns) {
      rows.push({
        type: "checkin",
        id: r.id,
        at: r.checked_in_at as string,
        kind: (r.kind ?? "in") as CheckInKind,
        // @ts-expect-error — join
        office: r.offices?.name ?? null,
        distance_m: r.distance_m,
        face_match_score: r.face_match_score,
        signedUrl: r.selfie_path ? signedMap.get(r.selfie_path) ?? "" : "",
        // @ts-expect-error — join
        isRemote: !!r.offices?.is_remote,
      });
    }

    const { data: ots } = await admin
      .from("overtime_requests")
      .select("id, created_at, ot_date, start_time, end_time, hours, reason, status")
      .eq("employee_id", employee.id)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const r of ots ?? []) {
      rows.push({
        type: "overtime",
        id: r.id,
        at: r.created_at as string,
        ot_date: r.ot_date,
        start_time: r.start_time,
        end_time: r.end_time,
        hours: Number(r.hours),
        reason: r.reason,
        status: (r.status ?? "pending") as OvertimeStatus,
      });
    }
  }

  if (type === "all" || type === "leave") {
    const { data } = await admin
      .from("leave_requests")
      .select("id, created_at, leave_date, category, duration, duration_unit, reason, status")
      .eq("employee_id", employee.id)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const r of data ?? []) {
      rows.push({
        type: "leave",
        id: r.id,
        at: r.created_at as string,
        leave_date: r.leave_date,
        category: r.category,
        duration: r.duration,
        duration_unit: r.duration_unit,
        reason: r.reason,
        status: (r.status ?? "pending") as LeaveStatus,
      });
    }
  }

  if (type === "all" || type === "violation") {
    const { data } = await admin
      .from("violation_reports")
      .select("id, created_at, report_date, total_amount, reason, status, violation_items(id)")
      .eq("employee_id", employee.id)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const r of data ?? []) {
      const items = (r as { violation_items?: unknown[] }).violation_items ?? [];
      rows.push({
        type: "violation",
        id: r.id,
        at: r.created_at as string,
        report_date: r.report_date,
        total_amount: Number(r.total_amount),
        itemCount: items.length,
        reason: r.reason,
        status: (r.status ?? "pending") as ViolationStatus,
      });
    }
  }

  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <main className="mx-auto max-w-md min-h-dvh px-safe pt-safe pb-safe flex flex-col gap-4">
      <header className="flex items-center gap-2 pt-2">
        <Link
          href="/"
          className="h-10 w-10 rounded-full hover:bg-white/50 flex items-center justify-center text-neutral-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">Của bạn</p>
          <h1 className="text-2xl font-semibold tracking-tight">Lịch sử</h1>
        </div>
      </header>

      <TypeTabs current={type} sp={sp} />

      <form action="/history" className="flex flex-wrap gap-2 rounded-2xl border border-white/60 glass p-3">
        <input type="hidden" name="type" value={type} />
        <FilterInput icon={Calendar} name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} />
        <FilterInput icon={Calendar} name="to"   type="date" defaultValue={to.toISOString().slice(0, 10)} />
        <Button size="sm" type="submit">Lọc</Button>
      </form>

      {rows.length === 0 ? (
        <Empty icon={Inbox} title="Chưa có gì" description="Các hoạt động của bạn sẽ hiện ở đây." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            if (r.type === "checkin") return <CheckInCard key={`c:${r.id}`} row={r} />;
            if (r.type === "leave") return <LeaveCard key={`l:${r.id}`} row={r} />;
            if (r.type === "overtime") return <OvertimeCard key={`o:${r.id}`} row={r} />;
            return <ViolationCard key={`v:${r.id}`} row={r} />;
          })}
        </div>
      )}
    </main>
  );
}

function TypeTabs({
  current,
  sp,
}: {
  current: string;
  sp: { from?: string; to?: string };
}) {
  const tabs = [
    { key: "all", label: "Tất cả", icon: Inbox },
    { key: "checkin", label: "Chấm công · OT", icon: Fingerprint },
    { key: "leave", label: "Xin nghỉ", icon: CalendarOff },
    { key: "violation", label: "Vi phạm", icon: ShieldAlert },
  ];
  const make = (k: string) => {
    const p = new URLSearchParams();
    if (k !== "all") p.set("type", k);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    return `/history${p.toString() ? "?" + p.toString() : ""}`;
  };
  return (
    <div className="overflow-x-auto -mx-2 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex p-1 rounded-xl bg-neutral-100/80 gap-1">
        {tabs.map((t) => {
          const active = current === t.key;
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={make(t.key)}
              prefetch
              scroll={false}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition shrink-0 whitespace-nowrap",
                active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
              )}
            >
              <Icon size={14} />
              {t.label}
            </Link>
          );
        })}
      </div>
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
    <div className="relative flex-1 min-w-[140px]">
      <Icon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-neutral-900"
        {...rest}
      />
    </div>
  );
}

function CheckInCard({ row: r }: { row: CheckInRow }) {
  const isIn = r.kind === "in";
  return (
    <div className="rounded-2xl border border-white/60 glass p-3 flex gap-3">
      {r.signedUrl ? (
        <Image src={r.signedUrl} width={56} height={56} alt="" className="rounded-xl object-cover h-14 w-14 shrink-0" unoptimized />
      ) : r.isRemote ? (
        <div className="h-14 w-14 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
          <Wifi size={20} />
        </div>
      ) : (
        <div className="h-14 w-14 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Fingerprint size={18} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
              isIn ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700",
            )}
          >
            {isIn ? <LogIn size={10} /> : <LogOut size={10} />}
            {isIn ? "Check-in" : "Check-out"}
          </span>
          {r.isRemote && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
              <Wifi size={10} /> Online
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm font-medium truncate flex items-center gap-1">
          <MapPin size={12} className="text-neutral-400" />
          {r.office ?? "—"}
        </div>
        <div className="text-xs text-neutral-500 mt-0.5">
          {formatVN(r.at, "EEEE, HH:mm '—' d/M/yyyy")}
          {r.distance_m != null && <> · cách {Math.round(r.distance_m)}m</>}
        </div>
      </div>
    </div>
  );
}

function LeaveCard({ row: r }: { row: LeaveRow }) {
  return (
    <div className="rounded-2xl border border-white/60 glass p-3 flex gap-3">
      <div className="h-14 w-14 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
        <CalendarOff size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
            <CalendarOff size={10} /> Xin nghỉ
          </span>
          <StatusBadge status={r.status} />
        </div>
        <div className="mt-0.5 text-sm font-medium truncate">{LEAVE_CATEGORIES[r.category]}</div>
        <div className="text-xs text-neutral-500">
          {formatVN(r.leave_date + "T00:00:00+07:00", "d/M/yyyy")} · {r.duration} {r.duration_unit === "day" ? "ngày" : "giờ"}
          <span className="text-neutral-400"> · nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}</span>
        </div>
        {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
      </div>
    </div>
  );
}

function OvertimeCard({ row: r }: { row: OvertimeRow }) {
  return (
    <div className="rounded-2xl border border-white/60 glass p-3 flex gap-3">
      <div className="h-14 w-14 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
        <Hourglass size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
            <Hourglass size={10} /> Overtime
          </span>
          <StatusBadge status={r.status} />
        </div>
        <div className="mt-0.5 text-sm font-medium tabular-nums">
          {formatVN(r.ot_date + "T00:00:00+07:00", "d/M/yyyy")} · {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {r.hours} giờ
        </div>
        <div className="text-xs text-neutral-400 mt-0.5">
          nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}
        </div>
        {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
      </div>
    </div>
  );
}

function ViolationCard({ row: r }: { row: ViolationRow }) {
  return (
    <div className="rounded-2xl border border-white/60 glass p-3 flex gap-3">
      <div className="h-14 w-14 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
        <ShieldAlert size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">
            <ShieldAlert size={10} /> Vi phạm
          </span>
          <StatusBadge status={r.status} />
        </div>
        <div className="mt-0.5 text-sm font-medium">
          {formatVN(r.report_date + "T00:00:00+07:00", "d/M/yyyy")} · {r.itemCount} lỗi ·{" "}
          <span className="text-rose-700 tabular-nums">{r.total_amount.toLocaleString("en-US")} VND</span>
        </div>
        <div className="text-xs text-neutral-400 mt-0.5">
          nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}
        </div>
        {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LeaveStatus | OvertimeStatus | ViolationStatus }) {
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
