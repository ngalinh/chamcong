import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { LEAVE_CATEGORIES, type LeaveCategory, type LeaveStatus, type CheckInKind, type OvertimeStatus } from "@/types/db";
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
  Hourglass,
  Lock,
  Wifi,
} from "lucide-react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { formatVN, dateVN as dateVnFn } from "@/lib/time";
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
  isRemote: boolean;
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
  approver_email: string | null;  // null = chưa gán chi nhánh hoặc chi nhánh không có approver
};

type OvertimeRow = {
  type: "overtime";
  id: string;
  at: string;
  employee: { name: string; email: string } | null;
  ot_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string | null;
  status: OvertimeStatus;
  approver_email: string | null;
};

type Row = CheckInRow | LeaveRow | OvertimeRow;

const dateInVN = dateVnFn;

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

async function decideLeave(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin, name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")); // 'approved' | 'rejected'
  if (decision !== "approved" && decision !== "rejected") throw new Error("Decision không hợp lệ");

  const admin = createAdminClient();
  const { data: leave } = await admin
    .from("leave_requests")
    .select("id, employee_id, status, leave_date, category, duration, duration_unit, reason, start_time, end_time, employees(name, email, home_office_id, offices:home_office_id(approver_email))")
    .eq("id", id)
    .maybeSingle();
  if (!leave || leave.status !== "pending") return;

  // Branch routing — chỉ admin được gán cho chi nhánh đó mới duyệt được
  // @ts-expect-error — supabase nested join
  const approver: string | null = leave.employees?.offices?.approver_email ?? null;
  if (approver && approver.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("Đơn này thuộc chi nhánh khác — bạn không có quyền duyệt");
  }

  await admin
    .from("leave_requests")
    .update({
      status: decision,
      approved_at: new Date().toISOString(),
      approved_by: me?.name ?? user.email,
    })
    .eq("id", id);

  // Recalc late/early cho các check-in trong ngày khi duyệt đơn nghỉ theo giờ
  // (lúc check-in, đơn còn pending nên đã tính theo giờ làm gốc — giờ duyệt rồi
  // thì cập nhật lại để bỏ/giảm label vi phạm).
  if (
    decision === "approved" &&
    leave.category === "leave_hourly" &&
    leave.start_time &&
    leave.end_time
  ) {
    const { timeToMinutes, formatVN } = await import("@/lib/time");
    const { effectiveWorkHours } = await import("@/lib/workHours");
    const dayStart = new Date(`${leave.leave_date}T00:00:00+07:00`).toISOString();
    const dayEnd = new Date(`${leave.leave_date}T23:59:59.999+07:00`).toISOString();
    const { data: dayCheckIns } = await admin
      .from("check_ins")
      .select("id, kind, checked_in_at, offices(work_start_time, work_end_time)")
      .eq("employee_id", leave.employee_id)
      .gte("checked_in_at", dayStart)
      .lte("checked_in_at", dayEnd);

    // @ts-expect-error — supabase join
    const empEmail: string | null = leave.employees?.email ?? null;
    const lStart = timeToMinutes(leave.start_time);
    const lEnd = timeToMinutes(leave.end_time);

    for (const ci of dayCheckIns ?? []) {
      // @ts-expect-error — supabase join
      const office = ci.offices as { work_start_time: string; work_end_time: string } | null;
      if (!office) continue;
      // Apply per-employee override trước rồi mới dịch theo leave window
      const base = effectiveWorkHours(empEmail, office.work_start_time, office.work_end_time);
      let effStart = base.start;
      let effEnd = base.end;
      const wStart = timeToMinutes(base.start);
      const wEnd = timeToMinutes(base.end);

      if (lStart <= wStart && lEnd > wStart) effStart = leave.end_time;
      if (lEnd >= wEnd && lStart < wEnd) effEnd = leave.start_time;

      const ciMin = timeToMinutes(formatVN(ci.checked_in_at as string, "HH:mm"));
      let late_minutes: number | null = null;
      let early_minutes: number | null = null;
      if (ci.kind === "in") {
        const diff = ciMin - timeToMinutes(effStart);
        if (diff > 0) late_minutes = diff;
      } else {
        const diff = timeToMinutes(effEnd) - ciMin;
        if (diff > 0) early_minutes = diff;
      }
      await admin
        .from("check_ins")
        .update({ late_minutes, early_minutes })
        .eq("id", ci.id);
    }
  }

  // Push notification cho nhân viên (fire-and-forget)
  {
    const { sendPushToEmployee } = await import("@/lib/push");
    const { formatVN: fmt } = await import("@/lib/time");
    sendPushToEmployee(String(leave.employee_id), {
      title: decision === "approved" ? "✅ Đơn xin nghỉ đã được duyệt" : "❌ Đơn xin nghỉ bị từ chối",
      body: `Ngày ${fmt(leave.leave_date + "T00:00:00+07:00", "d/M/yyyy")} · ${leave.duration} ${leave.duration_unit === "day" ? "ngày" : "giờ"}`,
      url: "/history",
      tag: `leave-${id}`,
    }).catch((e) => console.error("[push] employee notify failed", e));
  }

  // Gửi email nếu duyệt
  if (decision === "approved") {
    // @ts-expect-error — supabase join
    const emp = leave.employees as { name: string; email: string } | null;
    if (emp?.email) {
      const { sendMail } = await import("@/lib/email");
      const { LEAVE_CATEGORIES } = await import("@/types/db");
      const { formatVN } = await import("@/lib/time");
      const htmlEscape = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const dateStr = formatVN(leave.leave_date + "T00:00:00+07:00", "EEEE, d 'tháng' M yyyy");
      const html = `
        <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
          <h2 style="margin: 0 0 8px; font-size: 20px;">Đơn xin nghỉ của bạn đã được duyệt ✅</h2>
          <p style="color: #555; margin: 0 0 16px;">Xin chào <b>${htmlEscape(emp.name)}</b>,</p>
          <p style="color: #555; margin: 0 0 20px;">Đơn xin nghỉ của bạn vừa được quản lý duyệt. Chi tiết bên dưới:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #fafafa; border-radius: 8px; overflow: hidden;">
            <tr><td style="padding: 12px 16px; color: #666; width: 120px;">Ngày nghỉ</td><td style="padding: 12px 16px; font-weight: 500;">${htmlEscape(dateStr)}</td></tr>
            <tr style="border-top: 1px solid #eee"><td style="padding: 12px 16px; color: #666;">Loại</td><td style="padding: 12px 16px; font-weight: 500;">${htmlEscape(LEAVE_CATEGORIES[leave.category as keyof typeof LEAVE_CATEGORIES])}</td></tr>
            <tr style="border-top: 1px solid #eee"><td style="padding: 12px 16px; color: #666;">Thời gian</td><td style="padding: 12px 16px; font-weight: 500;">${leave.duration} ${leave.duration_unit === "day" ? "ngày" : "giờ"}</td></tr>
            ${leave.reason ? `<tr style="border-top: 1px solid #eee"><td style="padding: 12px 16px; color: #666;">Lý do</td><td style="padding: 12px 16px;">${htmlEscape(leave.reason)}</td></tr>` : ""}
          </table>
          <p style="color: #999; font-size: 13px; margin: 24px 0 0;">Email tự động — vui lòng không reply.<br/>Chấm công Basso</p>
        </div>
      `;
      await sendMail({
        to: emp.email,
        subject: "✅ Đơn xin nghỉ đã được duyệt",
        html,
      }).catch((e) => console.error("[email] failed", e));
    }
  }

  revalidatePath("/admin/history");
  revalidatePath("/admin");
}

async function deleteOvertime(formData: FormData) {
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

  await createAdminClient().from("overtime_requests").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/history");
  revalidatePath("/admin");
}

async function decideOvertime(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin, name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  if (decision !== "approved" && decision !== "rejected") throw new Error("Decision không hợp lệ");

  const admin = createAdminClient();
  const { data: ot } = await admin
    .from("overtime_requests")
    .select("id, employee_id, status, ot_date, hours, employees(home_office_id, offices:home_office_id(approver_email))")
    .eq("id", id)
    .maybeSingle();
  if (!ot || ot.status !== "pending") return;

  // @ts-expect-error — supabase nested join
  const approver: string | null = ot.employees?.offices?.approver_email ?? null;
  if (approver && approver.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("Đơn này thuộc chi nhánh khác — bạn không có quyền duyệt");
  }

  await admin
    .from("overtime_requests")
    .update({
      status: decision,
      approved_at: new Date().toISOString(),
      approved_by: me?.name ?? user.email,
    })
    .eq("id", id);

  // Push notify employee
  const { sendPushToEmployee } = await import("@/lib/push");
  sendPushToEmployee(String(ot.employee_id), {
    title: decision === "approved" ? "✅ Đơn OT đã được duyệt" : "❌ Đơn OT bị từ chối",
    body: `Ngày ${ot.ot_date} · ${ot.hours} giờ`,
    url: "/overtime",
    tag: `ot-${id}`,
  }).catch((e) => console.error("[push] employee notify failed", e));

  revalidatePath("/admin/history");
  revalidatePath("/admin");
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; office?: string; type?: RowType | "all"; status?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type ?? "all";
  const pendingOnly = sp.status === "pending";
  const supabase = await createClient();
  const { data: { user: viewer } } = await supabase.auth.getUser();
  const viewerEmail = viewer?.email?.toLowerCase() ?? "";
  const admin = createAdminClient();

  // Khi xem pending → mở rộng range tìm đơn cũ chưa duyệt (3 tháng)
  const from = sp.from
    ? new Date(sp.from)
    : new Date(Date.now() - (pendingOnly ? 90 : 7) * 86400_000);
  const to = sp.to ? new Date(sp.to) : new Date();
  to.setHours(23, 59, 59, 999);

  const { data: offices } = await admin.from("offices").select("id, name").order("name");

  // Check-ins — bỏ qua khi đang lọc pending (check-in không có khái niệm pending)
  const checkInsRows: CheckInRow[] = [];
  if (type !== "leave" && !pendingOnly) {
    let q = admin
      .from("check_ins")
      .select("id, kind, checked_in_at, distance_m, face_match_score, late_minutes, early_minutes, selfie_path, office_id, employees(id, name, email), offices(name, is_remote)")
      .gte("checked_in_at", from.toISOString())
      .lte("checked_in_at", to.toISOString())
      .order("checked_in_at", { ascending: false })
      .limit(300);
    if (sp.office) q = q.eq("office_id", sp.office);
    const { data } = await q;

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
        selfie_path: r.selfie_path ?? "",
        signedUrl: r.selfie_path ? signedMap.get(r.selfie_path) ?? "" : "",
        dateVN: dateInVN(at),
        // @ts-expect-error — join
        isRemote: !!r.offices?.is_remote,
      });
    }
  }

  // Leave requests — filter theo ngày TẠO đơn (created_at), không phải leave_date
  const leaveRows: LeaveRow[] = [];
  if (type === "leave" || type === "all") {
    let q = admin
      .from("leave_requests")
      .select("id, created_at, leave_date, category, duration, duration_unit, reason, status, employees(name, email, home_office_id, offices:home_office_id(approver_email))")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(300);
    if (pendingOnly) q = q.eq("status", "pending");
    const { data } = await q;
    for (const r of data ?? []) {
      // @ts-expect-error — supabase nested join
      const approver: string | null = r.employees?.offices?.approver_email ?? null;
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
        approver_email: approver,
      });
    }
  }

  // Overtime requests — gộp chung với tab Chấm công + All
  const overtimeRows: OvertimeRow[] = [];
  if (type === "checkin" || type === "all") {
    let q = admin
      .from("overtime_requests")
      .select("id, created_at, ot_date, start_time, end_time, hours, reason, status, employees(name, email, home_office_id, offices:home_office_id(approver_email))")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(300);
    if (pendingOnly) q = q.eq("status", "pending");
    const { data } = await q;
    for (const r of data ?? []) {
      // @ts-expect-error — supabase nested join
      const approver: string | null = r.employees?.offices?.approver_email ?? null;
      overtimeRows.push({
        type: "overtime",
        id: r.id,
        at: r.created_at as string,
        // @ts-expect-error — join
        employee: r.employees,
        ot_date: r.ot_date,
        start_time: r.start_time,
        end_time: r.end_time,
        hours: Number(r.hours),
        reason: r.reason,
        status: (r.status ?? "pending") as OvertimeStatus,
        approver_email: approver,
      });
    }
  }

  // Build Set<employee_id|leave_date> để tra cứu Vi phạm (cần toàn bộ leave trong khoảng check-in date)
  // Chỉ full-day leave (online_*, leave_paid, leave_unpaid) mới excuse violation.
  // leave_hourly đã được xử lý qua effective_start/end trong API checkin,
  // nên nếu late_minutes > 5 sau khi tính thì là vi phạm thật — không excuse bằng hasLeave.
  const leaveCoverSet = new Set<string>();
  if (checkInsRows.length > 0) {
    const dates = Array.from(new Set(checkInsRows.map((c) => c.dateVN))).sort();
    const empIds = Array.from(new Set(checkInsRows.map((c) => c.employee?.id).filter(Boolean))) as string[];
    if (dates.length > 0 && empIds.length > 0) {
      const { data: covers } = await admin
        .from("leave_requests")
        .select("employee_id, leave_date, status, category")
        .in("employee_id", empIds)
        .gte("leave_date", dates[0])
        .lte("leave_date", dates[dates.length - 1])
        .eq("status", "approved")
        .neq("category", "leave_hourly"); // hourly không auto-excuse
      for (const c of covers ?? []) {
        leaveCoverSet.add(`${c.employee_id}|${c.leave_date}`);
      }
    }
  }

  const rows: Row[] = [...checkInsRows, ...leaveRows, ...overtimeRows].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  const baseParams = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (sp.office) baseParams.set("office", sp.office);
  const csvHref = `/api/admin/check-ins/export?${baseParams.toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">
          {pendingOnly ? "Đơn chờ duyệt" : "Lịch sử"}
        </h1>
        <div className="flex items-center gap-2">
          {pendingOnly && (
            <a
              href="/admin/history"
              className="text-xs font-medium text-neutral-500 hover:text-neutral-700 underline underline-offset-2"
            >
              ← Xem tất cả lịch sử
            </a>
          )}
          <a href={csvHref}>
            <Button size="sm" variant="secondary">
              <Download size={14} /> CSV
            </Button>
          </a>
        </div>
      </div>

      <TypeTabs current={type} sp={sp} />

      <form action="/admin/history" className="flex flex-wrap gap-2 rounded-2xl border border-white/60 glass p-3">
        <input type="hidden" name="type" value={type} />
        <FilterInput icon={Calendar} name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} />
        <FilterInput icon={Calendar} name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} />
        {(type === "checkin" || type === "all") && (
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
          {rows.map((r) => {
            if (r.type === "checkin") {
              return (
                <CheckInCard
                  key={`c:${r.id}`}
                  row={r}
                  onDelete={deleteCheckIn}
                  hasLeave={!!r.employee && leaveCoverSet.has(`${r.employee.id}|${r.dateVN}`)}
                />
              );
            }
            if (r.type === "leave") {
              return <LeaveCard key={`l:${r.id}`} row={r} onDelete={deleteLeave} onDecide={decideLeave} viewerEmail={viewerEmail} />;
            }
            return <OvertimeCard key={`o:${r.id}`} row={r} onDelete={deleteOvertime} onDecide={decideOvertime} viewerEmail={viewerEmail} />;
          })}
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
    { key: "checkin", label: "Chấm công · OT", icon: Fingerprint },
    { key: "leave", label: "Xin nghỉ", icon: CalendarOff },
  ];
  const make = (k: string) => {
    const p = new URLSearchParams();
    if (k !== "all") p.set("type", k);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (sp.office && (k === "checkin" || k === "all")) p.set("office", sp.office);
    return `/admin/history${p.toString() ? "?" + p.toString() : ""}`;
  };
  return (
    <div className="inline-flex p-1 rounded-xl bg-neutral-100 gap-1">
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
              "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition",
              active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700",
            )}
          >
            <Icon size={14} />
            {t.label}
          </Link>
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
      ) : r.isRemote ? (
        <div className="h-16 w-16 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
          <Wifi size={26} />
        </div>
      ) : (
        <div className="h-16 w-16 rounded-xl bg-neutral-100 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <KindBadge kind={r.kind} />
          {r.isRemote ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
              <Wifi size={10} /> Online
            </span>
          ) : (
            r.face_match_score != null && (
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", matchOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                khớp {r.face_match_score.toFixed(2)}
              </span>
            )
          )}
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
          <span className="whitespace-nowrap">{formatVN(r.at, "dd/MM HH:mm")}</span>
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

function LeaveCard({
  row: r,
  onDelete,
  onDecide,
  viewerEmail,
}: {
  row: LeaveRow;
  onDelete: (fd: FormData) => void;
  onDecide: (fd: FormData) => void;
  viewerEmail: string;
}) {
  const canDecide = !r.approver_email || r.approver_email.toLowerCase() === viewerEmail;
  return (
    <div className="rounded-2xl border border-white/60 glass p-3">
      <div className="flex gap-3">
        <div className="h-16 w-16 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
          <CalendarOff size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
              <CalendarOff size={10} /> Xin nghỉ
            </span>
            <LeaveStatusBadge status={r.status} />
            {r.status === "pending" && r.approver_email && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                Duyệt: {r.approver_email}
              </span>
            )}
          </div>
          <div className="font-medium truncate mt-0.5">{r.employee?.name ?? "?"}</div>
          <div className="text-xs text-neutral-500 truncate">{r.employee?.email}</div>
          <div className="mt-1 text-xs text-neutral-700">
            <span className="font-medium">{LEAVE_CATEGORIES[r.category]}</span>
            <span className="text-neutral-500"> · ngày {formatVN(r.leave_date + "T00:00:00+07:00", "d/M")} · {r.duration} {r.duration_unit === "day" ? "ngày" : "giờ"}</span>
          </div>
          {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
          <div className="text-[10px] text-neutral-400 mt-1">Nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}</div>
        </div>
        <form action={onDelete} className="self-start">
          <input type="hidden" name="id" value={r.id} />
          <Button size="sm" variant="danger" type="submit"><Trash2 size={14} /></Button>
        </form>
      </div>

      {r.status === "pending" && (
        canDecide ? (
          <div className="flex gap-2 pt-3 mt-3 border-t border-neutral-200/60">
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="approved" />
              <button type="submit" className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition">
                <Check size={14} /> Duyệt
              </button>
            </form>
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="rejected" />
              <button type="submit" className="w-full h-9 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-medium inline-flex items-center justify-center gap-1.5 transition">
                <X size={14} /> Từ chối
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 pt-3 mt-3 border-t border-neutral-200/60 text-xs text-neutral-500">
            <Lock size={12} /> Chỉ admin được gán cho chi nhánh này mới duyệt được.
          </div>
        )
      )}
    </div>
  );
}

function OvertimeCard({
  row: r,
  onDelete,
  onDecide,
  viewerEmail,
}: {
  row: OvertimeRow;
  onDelete: (fd: FormData) => void;
  onDecide: (fd: FormData) => void;
  viewerEmail: string;
}) {
  const canDecide = !r.approver_email || r.approver_email.toLowerCase() === viewerEmail;
  return (
    <div className="rounded-2xl border border-white/60 glass p-3">
      <div className="flex gap-3">
        <div className="h-16 w-16 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
          <Hourglass size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
              <Hourglass size={10} /> Overtime
            </span>
            <OvertimeStatusBadge status={r.status} />
            {r.status === "pending" && r.approver_email && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                Duyệt: {r.approver_email}
              </span>
            )}
          </div>
          <div className="font-medium truncate mt-0.5">{r.employee?.name ?? "?"}</div>
          <div className="text-xs text-neutral-500 truncate">{r.employee?.email}</div>
          <div className="mt-1 text-xs text-neutral-700 tabular-nums">
            <span className="font-medium">{formatVN(r.ot_date + "T00:00:00+07:00", "d/M")}</span>
            <span className="text-neutral-500"> · {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {r.hours} giờ</span>
          </div>
          {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
          <div className="text-[10px] text-neutral-400 mt-1">Nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}</div>
        </div>
        <form action={onDelete} className="self-start">
          <input type="hidden" name="id" value={r.id} />
          <Button size="sm" variant="danger" type="submit"><Trash2 size={14} /></Button>
        </form>
      </div>

      {r.status === "pending" && (
        canDecide ? (
          <div className="flex gap-2 pt-3 mt-3 border-t border-neutral-200/60">
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="approved" />
              <button type="submit" className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition">
                <Check size={14} /> Duyệt
              </button>
            </form>
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="rejected" />
              <button type="submit" className="w-full h-9 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-medium inline-flex items-center justify-center gap-1.5 transition">
                <X size={14} /> Từ chối
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 pt-3 mt-3 border-t border-neutral-200/60 text-xs text-neutral-500">
            <Lock size={12} /> Chỉ admin được gán cho chi nhánh này mới duyệt được.
          </div>
        )
      )}
    </div>
  );
}

function OvertimeStatusBadge({ status }: { status: OvertimeStatus }) {
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
