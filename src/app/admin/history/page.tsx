import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { LEAVE_CATEGORIES, type LeaveCategory, type LeaveStatus, type CheckInKind } from "@/types/db";
import {
  Inbox,
  Trash2,
  Calendar,
  MapPin,
  Fingerprint,
  CalendarOff,
  Download,
  Check,
  X,
  Clock,
  LogIn,
  LogOut,
  AlertTriangle,
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
  kind: CheckInKind;
  employee: { id: string; name: string; email: string } | null;
  office: string | null;
  distance_m: number | null;
  face_match_score: number | null;
  late_minutes: number | null;
  early_minutes: number | null;
  selfie_path: string;
  signedUrl: string;
  dateVN: string;
};

type LeaveRow = {
  type: "leave";
  id: string;
  at: string;
  employee: { name: string; email: string } | null;
  leave_date: string;
  category: LeaveCategory;
  duration: number;
  duration_unit: "day" | "hour";
  reason: string | null;
  status: LeaveStatus;
};

type Row = CheckInRow | LeaveRow;

function dateInVN(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

async function deleteCheckIn(formData: FormData) {
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
  const selfiePath = String(formData.get("selfie_path") ?? "");
  const admin = createAdminClient();
  await admin.from("check_ins").delete().eq("id", id);
  if (selfiePath) await admin.storage.from("selfies").remove([selfiePath]);
  revalidatePath("/admin/history");
  revalidatePath("/admin");
}

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

  await createAdminClient().from("leave_requests").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/history");
  revalidatePath("/admin");
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; office?: string; type?: RowType | "all" }>;
}) {
  const sp = await searchParams;
  const type = sp.type ?? "all";
  const admin = createAdminClient();

  const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 7 * 86400_000);
  const to = sp.to ? new Date(sp.to) : new Date();
  to.setHours(23, 59, 59, 999);

  const { data: offices } = await admin.from("offices").select("id, name").order("name");

  // Check-ins
  const checkInsRows: CheckInRow[] = [];
  if (type !== "leave") {
    let q = admin
      .from("check_ins")
      .select("id, kind, checked_in_at, distance_m, face_match_score, late_minutes, early_minutes, selfie_path, office_id, employees(id, name, email), offices(name)")
      .gte("checked_in_at", from.toISOString())
      .lte("checked_in_at", to.toISOString())
      .order("checked_in_at", { ascending: false })
      .limit(300);
    if (sp.office) q = q.eq("office_id", sp.office);
    const { data } = await q;
    for (const r of data ?? []) {
      const { data: signed } = await admin.storage.from("selfies").createSignedUrl(r.selfie_path, 3600);
      const at = r.checked_in_at as string;
      checkInsRows.push({
        type: "checkin",
        id: r.id,
        at,
        kind: (r.kind ?? "in") as CheckInKind,
        // @ts-expect-error — join
        employee: r.employees,
        // @ts-expect-error — join
        office: r.offices?.name ?? null,
        distance_m: r.distance_m,
        face_match_score: r.face_match_score,
        late_minutes: r.late_minutes,
        early_minutes: r.early_minutes,
        selfie_path: r.selfie_path,
        signedUrl: signed?.signedUrl ?? "",
        dateVN: dateInVN(at),
      });
    }
  }

  // Leave requests — filter theo ngày TẠO đơn (created_at), không phải leave_date
  const leaveRows: LeaveRow[] = [];
  if (type !== "checkin") {
    const { data } = await admin
      .from("leave_requests")
      .select("id, created_at, leave_date, category, duration, duration_unit, reason, status, employees(name, email)")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(300);
    for (const r of data ?? []) {
      leaveRows.push({
        type: "leave",
        id: r.id,
        at: r.created_at as string,
        // @ts-expect-error — join
        employee: r.employees,
        leave_date: r.leave_date,
        category: r.category,
        duration: r.duration,
        duration_unit: r.duration_unit,
        reason: r.reason,
        status: (r.status ?? "pending") as LeaveStatus,
      });
    }
  }

  // Build Set<employee_id|leave_date> để tra cứu Vi phạm (cần toàn bộ leave trong khoảng check-in date)
  const leaveCoverSet = new Set<string>();
  if (checkInsRows.length > 0) {
    const dates = Array.from(new Set(checkInsRows.map((c) => c.dateVN))).sort();
    const empIds = Array.from(new Set(checkInsRows.map((c) => c.employee?.id).filter(Boolean))) as string[];
    if (dates.length > 0 && empIds.length > 0) {
      const { data: covers } = await admin
        .from("leave_requests")
        .select("employee_id, leave_date")
        .in("employee_id", empIds)
        .gte("leave_date", dates[0])
        .lte("leave_date", dates[dates.length - 1]);
      for (const c of covers ?? []) {
        leaveCoverSet.add(`${c.employee_id}|${c.leave_date}`);
      }
    }
  }

  const rows: Row[] = [...checkInsRows, ...leaveRows].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  const baseParams = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (sp.office) baseParams.set("office", sp.office);
  const csvHref = `/api/admin/check-ins/export?${baseParams.toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Lịch sử</h1>
        <a href={csvHref}>
          <Button size="sm" variant="secondary">
            <Download size={14} /> CSV
          </Button>
        </a>
      </div>

      <TypeTabs current={type} sp={sp} />

      <form action="/admin/history" className="flex flex-wrap gap-2 rounded-2xl border border-white/60 glass p-3">
        <input type="hidden" name="type" value={type} />
        <FilterInput icon={Calendar} name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} />
        <FilterInput icon={Calendar} name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} />
        {type !== "leave" && (
          <div className="relative flex-1 min-w-[140px]">
            <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <select
              name="office"
              defaultValue={sp.office ?? ""}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">Tất cả chi nhánh</option>
              {offices?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
        <Button size="sm" type="submit">Lọc</Button>
      </form>

      {rows.length === 0 ? (
        <Empty icon={Inbox} title="Không có dữ liệu" description="Điều chỉnh bộ lọc hoặc thời gian." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) =>
            r.type === "checkin"
              ? <CheckInCard key={`c:${r.id}`} row={r} onDelete={deleteCheckIn} hasLeave={!!r.employee && leaveCoverSet.has(`${r.employee.id}|${r.dateVN}`)} />
              : <LeaveCard key={`l:${r.id}`} row={r} onDelete={deleteLeave} />,
          )}
        </div>
      )}
    </div>
  );
}

function TypeTabs({
  current,
  sp,
}: {
  current: string;
  sp: { from?: string; to?: string; office?: string };
}) {
  const tabs = [
    { key: "all", label: "Tất cả", icon: Inbox },
    { key: "checkin", label: "Chấm công", icon: Fingerprint },
    { key: "leave", label: "Xin nghỉ", icon: CalendarOff },
  ];
  const make = (k: string) => {
    const p = new URLSearchParams();
    if (k !== "all") p.set("type", k);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (sp.office && k !== "leave") p.set("office", sp.office);
    return `/admin/history${p.toString() ? "?" + p.toString() : ""}`;
  };
  return (
    <div className="inline-flex p-1 rounded-xl bg-neutral-100 gap-1">
      {tabs.map((t) => {
        const active = current === t.key;
        const Icon = t.icon;
        return (
          <a
            key={t.key}
            href={make(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition",
              active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700",
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

function CheckInCard({
  row: r,
  onDelete,
  hasLeave,
}: {
  row: CheckInRow;
  onDelete: (fd: FormData) => void;
  hasLeave: boolean;
}) {
  const matchOk = r.face_match_score != null && r.face_match_score < 0.5;
  const isViolation =
    !hasLeave &&
    ((r.kind === "in" && (r.late_minutes ?? 0) > 5) ||
      (r.kind === "out" && (r.early_minutes ?? 0) > 5));
  return (
    <div className={cn(
      "rounded-2xl border p-3 flex gap-3",
      isViolation ? "border-rose-300 bg-rose-50/60" : "border-white/60 glass",
    )}>
      {r.signedUrl ? (
        <Image src={r.signedUrl} width={64} height={64} alt="" className="rounded-xl object-cover h-16 w-16 shrink-0" unoptimized />
      ) : <div className="h-16 w-16 rounded-xl bg-neutral-100 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <KindBadge kind={r.kind} />
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", matchOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
            khớp {r.face_match_score?.toFixed(2) ?? "-"}
          </span>
          {r.kind === "in" && (r.late_minutes ?? 0) > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
              Muộn {r.late_minutes}p
            </span>
          )}
          {r.kind === "out" && (r.early_minutes ?? 0) > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
              Về sớm {r.early_minutes}p
            </span>
          )}
          {isViolation && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500 text-white">
              <AlertTriangle size={10} /> Vi phạm
            </span>
          )}
          {!isViolation && hasLeave && ((r.late_minutes ?? 0) > 5 || (r.early_minutes ?? 0) > 5) && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
              Có đơn nghỉ
            </span>
          )}
        </div>
        <div className="font-medium truncate mt-0.5">{r.employee?.name ?? "?"}</div>
        <div className="text-xs text-neutral-500 truncate">{r.employee?.email}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-600 flex-wrap">
          <span className="truncate">{r.office ?? "—"}</span>
          <span>·</span>
          <span className="whitespace-nowrap">{format(new Date(r.at), "dd/MM HH:mm", { locale: vi })}</span>
          {r.distance_m != null && <><span>·</span><span>{Math.round(r.distance_m)}m</span></>}
        </div>
      </div>
      <form action={onDelete} className="self-start">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="selfie_path" value={r.selfie_path} />
        <Button size="sm" variant="danger" type="submit"><Trash2 size={14} /></Button>
      </form>
    </div>
  );
}

function LeaveCard({ row: r, onDelete }: { row: LeaveRow; onDelete: (fd: FormData) => void }) {
  return (
    <div className="rounded-2xl border border-white/60 glass p-3 flex gap-3">
      <div className="h-16 w-16 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
        <CalendarOff size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
            <CalendarOff size={10} /> Xin nghỉ
          </span>
          <LeaveStatusBadge status={r.status} />
        </div>
        <div className="font-medium truncate mt-0.5">{r.employee?.name ?? "?"}</div>
        <div className="text-xs text-neutral-500 truncate">{r.employee?.email}</div>
        <div className="mt-1 text-xs text-neutral-700">
          <span className="font-medium">{LEAVE_CATEGORIES[r.category]}</span>
          <span className="text-neutral-500"> · ngày {format(new Date(r.leave_date), "d/M", { locale: vi })} · {r.duration} {r.duration_unit === "day" ? "ngày" : "giờ"}</span>
        </div>
        {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
        <div className="text-[10px] text-neutral-400 mt-1">Nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}</div>
      </div>
      <form action={onDelete} className="self-start">
        <input type="hidden" name="id" value={r.id} />
        <Button size="sm" variant="danger" type="submit"><Trash2 size={14} /></Button>
      </form>
    </div>
  );
}

function KindBadge({ kind }: { kind: CheckInKind }) {
  if (kind === "in") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
        <LogIn size={10} /> Check-in
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
      <LogOut size={10} /> Check-out
    </span>
  );
}

function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
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
