import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Empty } from "@/components/ui/Empty";
import { LEAVE_CATEGORIES, type LeaveCategory, type LeaveStatus } from "@/types/db";
import {
  ArrowLeft,
  Inbox,
  Fingerprint,
  CalendarOff,
  Check,
  Clock,
  X,
  MapPin,
} from "lucide-react";
import Image from "next/image";
import { format, formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type RowType = "checkin" | "leave";

type CheckInRow = {
  type: "checkin";
  id: string;
  at: string;
  office: string | null;
  distance_m: number | null;
  face_match_score: number | null;
  signedUrl: string;
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

type Row = CheckInRow | LeaveRow;

export default async function MyHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: RowType | "all" }>;
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

  const from = new Date();
  from.setDate(from.getDate() - 60); // 60 ngày qua

  const rows: Row[] = [];

  if (type !== "leave") {
    const { data } = await admin
      .from("check_ins")
      .select("id, checked_in_at, distance_m, face_match_score, selfie_path, offices(name)")
      .eq("employee_id", employee.id)
      .gte("checked_in_at", from.toISOString())
      .order("checked_in_at", { ascending: false })
      .limit(100);
    for (const r of data ?? []) {
      const { data: signed } = await admin.storage.from("selfies").createSignedUrl(r.selfie_path, 3600);
      rows.push({
        type: "checkin",
        id: r.id,
        at: r.checked_in_at as string,
        // @ts-expect-error — join
        office: r.offices?.name ?? null,
        distance_m: r.distance_m,
        face_match_score: r.face_match_score,
        signedUrl: signed?.signedUrl ?? "",
      });
    }
  }

  if (type !== "checkin") {
    const { data } = await admin
      .from("leave_requests")
      .select("id, created_at, leave_date, category, duration, duration_unit, reason, status")
      .eq("employee_id", employee.id)
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

      <TypeTabs current={type} />

      {rows.length === 0 ? (
        <Empty icon={Inbox} title="Chưa có gì" description="Các lần chấm công và đơn xin nghỉ của bạn sẽ hiện ở đây." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) =>
            r.type === "checkin" ? <CheckInCard key={`c:${r.id}`} row={r} /> : <LeaveCard key={`l:${r.id}`} row={r} />,
          )}
        </div>
      )}
    </main>
  );
}

function TypeTabs({ current }: { current: string }) {
  const tabs = [
    { key: "all", label: "Tất cả", icon: Inbox },
    { key: "checkin", label: "Chấm công", icon: Fingerprint },
    { key: "leave", label: "Xin nghỉ", icon: CalendarOff },
  ];
  return (
    <div className="inline-flex p-1 rounded-xl bg-neutral-100/80 gap-1 self-start">
      {tabs.map((t) => {
        const active = current === t.key;
        const Icon = t.icon;
        const href = t.key === "all" ? "/history" : `/history?type=${t.key}`;
        return (
          <a
            key={t.key}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition",
              active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
            )}
          >
            <Icon size={14} />
            {t.label}
          </a>
        );
      })}
    </div>
  );
}

function CheckInCard({ row: r }: { row: CheckInRow }) {
  return (
    <div className="rounded-2xl border border-white/60 glass p-3 flex gap-3">
      {r.signedUrl ? (
        <Image src={r.signedUrl} width={56} height={56} alt="" className="rounded-xl object-cover h-14 w-14 shrink-0" unoptimized />
      ) : (
        <div className="h-14 w-14 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Fingerprint size={18} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
            <Fingerprint size={10} /> Chấm công
          </span>
        </div>
        <div className="mt-0.5 text-sm font-medium truncate flex items-center gap-1">
          <MapPin size={12} className="text-neutral-400" />
          {r.office ?? "—"}
        </div>
        <div className="text-xs text-neutral-500 mt-0.5">
          {format(new Date(r.at), "EEEE, HH:mm '—' d/M/yyyy", { locale: vi })}
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
          {format(new Date(r.leave_date), "d/M/yyyy", { locale: vi })} · {r.duration} {r.duration_unit === "day" ? "ngày" : "giờ"}
          <span className="text-neutral-400"> · nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}</span>
        </div>
        {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LeaveStatus }) {
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
