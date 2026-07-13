import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { SubmitButton } from "@/components/SubmitButton";
import EditCheckInModal from "@/components/admin/EditCheckInModal";
import AddCheckInModal from "@/components/admin/AddCheckInModal";
import { LEAVE_CATEGORIES, type LeaveCategory, type LeaveStatus, type CheckInKind, type OvertimeStatus, type ViolationStatus, type ViolationKind, type ViolationItem } from "@/types/db";
import {
  Inbox,
  Trash2,
  Calendar,
  MapPin,
  Users,
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
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { formatVN, dateVN as dateVnFn } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type RowType = "checkin" | "leave" | "violation";

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
  edited_at: string | null;
  edited_by: string | null;
  edit_reason: string | null;
  manual: boolean;
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
  start_time: string | null;
  end_time: string | null;
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

type ViolationRow = {
  type: "violation";
  id: string;
  at: string;
  employee: { name: string; email: string } | null;
  kind: ViolationKind;
  report_date: string;
  total_amount: number;
  reason: string | null;
  status: ViolationStatus;
  approver_email: string | null;
  items: { description: string; amount: number; position: number }[];
};

type Row = CheckInRow | LeaveRow | OvertimeRow | ViolationRow;

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

/** Sửa giờ và/hoặc loại của 1 check-in hiện có. Recalc late/early. */
async function updateCheckIn(formData: FormData) {
  "use server";
  const { timeToMinutes } = await import("@/lib/time");
  const { computeLateEarly } = await import("@/lib/late-early");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  const dateStr = String(formData.get("date"));
  const timeStr = String(formData.get("time"));
  const kind = String(formData.get("kind"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("Ngày không hợp lệ");
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) throw new Error("Giờ không hợp lệ");
  if (kind !== "in" && kind !== "out") throw new Error("Loại không hợp lệ");

  const admin = createAdminClient();
  // Lấy thông tin check-in để biết employee + office
  const { data: ci } = await admin
    .from("check_ins")
    .select("id, employee_id, office_id, employees(email, work_start_time, work_end_time, work_shifts), offices(work_start_time, work_end_time)")
    .eq("id", id)
    .maybeSingle();
  if (!ci) throw new Error("Không tìm thấy check-in");

  // ISO timestamp với giờ VN (UTC+7)
  const checkedInAt = new Date(`${dateStr}T${timeStr.length === 5 ? timeStr + ":00" : timeStr}+07:00`).toISOString();

  // Hourly leave override (nếu có, có thể nhiều đơn trong cùng ngày)
  const { data: hourlyLeavesRaw } = await admin
    .from("leave_requests")
    .select("start_time, end_time, category")
    .eq("employee_id", ci.employee_id)
    .eq("leave_date", dateStr)
    .in("category", ["leave_hourly", "online_wfh", "leave_paid"])
    .not("start_time", "is", null)
    .eq("status", "approved");

  // @ts-expect-error nested join
  const empJoin = ci.employees as { email: string | null; work_start_time: string | null; work_end_time: string | null; work_shifts: { start: string; end: string }[] | null } | null;
  // @ts-expect-error nested join
  const officeJoin = ci.offices as { work_start_time: string; work_end_time: string } | null;
  if (!officeJoin) throw new Error("Check-in không có chi nhánh");

  const [h, m] = timeStr.split(":").map(Number);
  const { late_minutes, early_minutes } = computeLateEarly({
    emp: empJoin ?? {},
    office: officeJoin,
    hourlyLeaves: hourlyLeavesRaw ?? [],
    kind: kind as "in" | "out",
    timeMinutes: (h || 0) * 60 + (m || 0),
  });
  void timeToMinutes; // satisfy import

  const { error } = await admin
    .from("check_ins")
    .update({
      kind,
      checked_in_at: checkedInAt,
      late_minutes,
      early_minutes,
      edited_at: new Date().toISOString(),
      edited_by: user.email,
      edit_reason: reason,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Invalidate payroll snapshot tháng đó
  await admin
    .from("payroll_snapshots")
    .delete()
    .eq("employee_id", ci.employee_id)
    .eq("year_month", dateStr.slice(0, 7));

  revalidatePath("/admin/history");
  revalidatePath("/admin");
  revalidatePath("/history");
}

/** Tạo 1 check-in thủ công (NV quên chấm). */
async function createManualCheckIn(formData: FormData) {
  "use server";
  const { computeLateEarly } = await import("@/lib/late-early");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const employeeId = String(formData.get("employee_id"));
  const officeId = String(formData.get("office_id"));
  const dateStr = String(formData.get("date"));
  const timeStr = String(formData.get("time"));
  const kind = String(formData.get("kind"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("Ngày không hợp lệ");
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) throw new Error("Giờ không hợp lệ");
  if (kind !== "in" && kind !== "out") throw new Error("Loại không hợp lệ");

  const admin = createAdminClient();
  const [{ data: emp }, { data: office }] = await Promise.all([
    admin.from("employees").select("id, email, work_start_time, work_end_time, work_shifts").eq("id", employeeId).maybeSingle(),
    admin.from("offices").select("id, work_start_time, work_end_time").eq("id", officeId).maybeSingle(),
  ]);
  if (!emp) throw new Error("Không tìm thấy nhân viên");
  if (!office) throw new Error("Không tìm thấy chi nhánh");

  const checkedInAt = new Date(`${dateStr}T${timeStr.length === 5 ? timeStr + ":00" : timeStr}+07:00`).toISOString();

  const { data: hourlyLeavesRaw } = await admin
    .from("leave_requests")
    .select("start_time, end_time, category")
    .eq("employee_id", employeeId)
    .eq("leave_date", dateStr)
    .in("category", ["leave_hourly", "online_wfh", "leave_paid"])
    .not("start_time", "is", null)
    .eq("status", "approved");

  const [h, m] = timeStr.split(":").map(Number);
  const { late_minutes, early_minutes } = computeLateEarly({
    emp: {
      email: emp.email,
      work_start_time: emp.work_start_time,
      work_end_time: emp.work_end_time,
      work_shifts: (emp.work_shifts ?? null) as { start: string; end: string }[] | null,
    },
    office: { work_start_time: office.work_start_time, work_end_time: office.work_end_time },
    hourlyLeaves: hourlyLeavesRaw ?? [],
    kind: kind as "in" | "out",
    timeMinutes: (h || 0) * 60 + (m || 0),
  });

  const { error } = await admin.from("check_ins").insert({
    employee_id: employeeId,
    office_id: officeId,
    kind,
    checked_in_at: checkedInAt,
    selfie_path: null,
    latitude: null,
    longitude: null,
    distance_m: null,
    face_match_score: null,
    liveness_passed: null,
    late_minutes,
    early_minutes,
    user_agent: null,
    created_by_admin_email: user.email,
    edit_reason: reason,
  });
  if (error) throw new Error(error.message);

  // Invalidate payroll snapshot tháng đó để bảng lương recompute từ check-in mới
  await admin
    .from("payroll_snapshots")
    .delete()
    .eq("employee_id", employeeId)
    .eq("year_month", dateStr.slice(0, 7));

  revalidatePath("/admin/history");
  revalidatePath("/admin");
  revalidatePath("/history");
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

  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")); // 'approved' | 'rejected'
  if (decision !== "approved" && decision !== "rejected") throw new Error("Decision không hợp lệ");

  const admin = createAdminClient();

  // Parallel: auth check + leave fetch (cả 2 chỉ cần user.id và id — độc lập nhau)
  const [{ data: me }, { data: leave }] = await Promise.all([
    supabase.from("employees").select("is_admin, name, email").eq("user_id", user.id).maybeSingle(),
    admin.from("leave_requests")
      .select("id, employee_id, status, leave_date, category, duration, duration_unit, reason, start_time, end_time, employees(name, email, home_office_id, work_start_time, work_end_time, work_shifts, offices:home_office_id(approver_email))")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");
  if (!leave || leave.status !== "pending") return;

  // Branch routing — chỉ admin được gán cho chi nhánh đó mới duyệt được
  // @ts-expect-error — supabase nested join
  const approver: string | null = leave.employees?.offices?.approver_email ?? null;
  if (approver && approver.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("Đơn này thuộc chi nhánh khác — bạn không có quyền duyệt");
  }

  const needsBalanceLog = leave.category === "leave_paid" || leave.category === "online_wfh";
  const needsRecalc =
    decision === "approved" &&
    (leave.category === "leave_hourly" || leave.category === "online_wfh" || leave.category === "leave_paid") &&
    !!leave.start_time && !!leave.end_time;

  const dayStart = needsRecalc ? new Date(`${leave.leave_date}T00:00:00+07:00`).toISOString() : "";
  const dayEnd   = needsRecalc ? new Date(`${leave.leave_date}T23:59:59.999+07:00`).toISOString() : "";

  // Parallel: update leave + prefetch side-effect data (balance, day check-ins)
  const [, balanceRes, dayCheckInsRes] = await Promise.all([
    admin.from("leave_requests").update({
      status: decision,
      approved_at: new Date().toISOString(),
      approved_by: me?.name ?? user.email,
    }).eq("id", id),
    needsBalanceLog
      ? admin.from("employees").select("leave_balance").eq("id", leave.employee_id).maybeSingle()
      : Promise.resolve({ data: null }),
    needsRecalc
      ? admin.from("check_ins")
          .select("id, kind, checked_in_at, offices(work_start_time, work_end_time)")
          .eq("employee_id", leave.employee_id)
          .gte("checked_in_at", dayStart)
          .lte("checked_in_at", dayEnd)
      : Promise.resolve({ data: null }),
  ]);

  // Fetch approved hourly leaves sau khi update đã commit (để include đơn vừa duyệt)
  const { data: approvedHourlyLeaves } = needsRecalc
    ? await admin.from("leave_requests")
        .select("start_time, end_time, category")
        .eq("employee_id", leave.employee_id)
        .eq("leave_date", leave.leave_date)
        .in("category", ["leave_hourly", "online_wfh", "leave_paid"])
        .not("start_time", "is", null)
        .eq("status", "approved")
    : { data: null };

  // Parallel: ghi log balance + recalc check-ins
  const finalOps: Promise<unknown>[] = [];

  // Ghi log lịch sử ngày phép (thông tin; balance thực tế trừ lúc chốt lương)
  if (needsBalanceLog) {
    const currentBalance = Number(balanceRes.data?.leave_balance ?? 0);
    const expectedDeduct =
      leave.category === "leave_paid"
        ? leave.start_time ? -0.5 : -1
        : leave.duration_unit === "day" ? -0.5 : 0;
    const catLabel = leave.category === "leave_paid" ? "nghỉ phép có lương" : "WFH";
    finalOps.push(Promise.resolve(admin.from("leave_balance_log").insert({
      employee_id: leave.employee_id,
      delta: decision === "approved" ? expectedDeduct : 0,
      balance_after: currentBalance,
      event_type: decision === "approved" ? "leave_approved" : "leave_rejected",
      note:
        decision === "approved"
          ? `Duyệt đơn ${catLabel} ngày ${leave.leave_date}${expectedDeduct ? ` (dự kiến trừ ${Math.abs(expectedDeduct)} ngày khi chốt lương)` : ""}`
          : `Từ chối đơn ${catLabel} ngày ${leave.leave_date}`,
      leave_request_id: leave.id,
    })));
  }

  // Recalc late/early cho check-in trong ngày khi duyệt đơn nghỉ theo giờ
  if (needsRecalc && dayCheckInsRes.data) {
    const { timeToMinutes, formatVN } = await import("@/lib/time");
    const { computeLateEarly } = await import("@/lib/late-early");

    const empJoin = leave.employees as unknown as {
      email: string | null;
      work_start_time: string | null;
      work_end_time: string | null;
      work_shifts: { start: string; end: string }[] | null;
    } | null;
    const empForHours = {
      email: empJoin?.email ?? null,
      work_start_time: empJoin?.work_start_time ?? null,
      work_end_time: empJoin?.work_end_time ?? null,
      work_shifts: empJoin?.work_shifts ?? null,
    };
    const hourlyLeaves = approvedHourlyLeaves ?? [];

    finalOps.push(
      Promise.all((dayCheckInsRes.data ?? []).map(async (ci) => {
        // @ts-expect-error — supabase join
        const office = ci.offices as { work_start_time: string; work_end_time: string } | null;
        if (!office) return;
        const ciMin = timeToMinutes(formatVN(ci.checked_in_at as string, "HH:mm"));
        const { late_minutes, early_minutes } = computeLateEarly({
          emp: empForHours,
          office,
          hourlyLeaves,
          kind: ci.kind as "in" | "out",
          timeMinutes: ciMin,
        });
        await admin.from("check_ins").update({ late_minutes, early_minutes }).eq("id", ci.id);
      }))
    );
  }

  await Promise.all(finalOps);

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

  // Gửi email nếu duyệt — fire-and-forget để không chặn response (Gmail SMTP 1-3s)
  if (decision === "approved") {
    // @ts-expect-error — supabase join
    const emp = leave.employees as { name: string; email: string } | null;
    if (emp?.email) {
      (async () => {
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
        });
      })().catch((e) => console.error("[email] failed", e));
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

async function deleteViolation(formData: FormData) {
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

  await createAdminClient().from("violation_reports").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/history");
  revalidatePath("/admin");
}

async function decideViolation(formData: FormData) {
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
  const { data: rep } = await admin
    .from("violation_reports")
    .select("id, employee_id, kind, status, report_date, total_amount, employees(home_office_id, offices:home_office_id(approver_email))")
    .eq("id", id)
    .maybeSingle();
  if (!rep || rep.status !== "pending") return;

  // @ts-expect-error — supabase nested join
  const approver: string | null = rep.employees?.offices?.approver_email ?? null;
  if (approver && approver.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("Đơn này thuộc chi nhánh khác — bạn không có quyền duyệt");
  }

  await admin
    .from("violation_reports")
    .update({
      status: decision,
      approved_at: new Date().toISOString(),
      approved_by: me?.name ?? user.email,
    })
    .eq("id", id);

  const isBonus = rep.kind === "bonus";
  const subject = isBonus ? "thưởng" : "vi phạm";
  const { sendPushToEmployee } = await import("@/lib/push");
  sendPushToEmployee(String(rep.employee_id), {
    title: decision === "approved" ? `✅ Đơn ${subject} đã được duyệt` : `❌ Đơn ${subject} bị từ chối`,
    body: `Ngày ${rep.report_date} · ${Number(rep.total_amount).toLocaleString("en-US")} VND`,
    url: "/violations",
    tag: `violation-${id}`,
  }).catch((e) => console.error("[push] employee notify failed", e));

  revalidatePath("/admin/history");
  revalidatePath("/admin");
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; office?: string; employee?: string; type?: RowType | "all"; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type ?? "all";
  const pendingOnly = sp.status === "pending";
  const supabase = await createClient();
  const { data: { user: viewer } } = await supabase.auth.getUser();
  const viewerEmail = viewer?.email?.toLowerCase() ?? "";
  const admin = createAdminClient();

  // Phân trang per-source (mỗi loại record fetch độc lập). Tab cụ thể = exact;
  // tab "all" = mỗi source page riêng → mix thời gian gần đúng (chấp nhận được
  // vì admin thường lọc theo tab cụ thể khi cần xem sâu).
  const PAGE_SIZE = pendingOnly ? 100 : 50;
  const page = Math.max(1, Number(sp.page) || 1);
  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  // Khi xem pending → mở rộng range tìm đơn cũ chưa duyệt (3 tháng)
  const from = sp.from
    ? new Date(sp.from)
    : new Date(Date.now() - (pendingOnly ? 90 : 7) * 86400_000);
  const to = sp.to ? new Date(sp.to) : new Date();
  to.setHours(23, 59, 59, 999);

  const [{ data: offices }, { data: employeesList }] = await Promise.all([
    admin.from("offices").select("id, name").order("name"),
    // Hiện cả NV đã soft-delete để admin tìm history của họ; sort active lên trước.
    admin.from("employees").select("id, name, email, home_office_id, is_active").order("is_active", { ascending: false }).order("name"),
  ]);
  const employeeFilter = sp.employee || null;

  // Check-ins — bỏ qua khi đang lọc pending (check-in không có khái niệm pending)
  const checkInsRows: CheckInRow[] = [];
  if ((type === "all" || type === "checkin") && !pendingOnly) {
    let q = admin
      .from("check_ins")
      .select("id, kind, checked_in_at, distance_m, face_match_score, late_minutes, early_minutes, selfie_path, office_id, edited_at, edited_by, edit_reason, created_by_admin_email, employees(id, name, email), offices(name, is_remote)")
      .gte("checked_in_at", from.toISOString())
      .lte("checked_in_at", to.toISOString())
      .order("checked_in_at", { ascending: false })
      .range(rangeFrom, rangeTo);
    if (sp.office) q = q.eq("office_id", sp.office);
    if (employeeFilter) q = q.eq("employee_id", employeeFilter);
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
        edited_at: (r as { edited_at?: string | null }).edited_at ?? null,
        edited_by: (r as { edited_by?: string | null }).edited_by ?? null,
        edit_reason: (r as { edit_reason?: string | null }).edit_reason ?? null,
        manual: !!(r as { created_by_admin_email?: string | null }).created_by_admin_email,
      });
    }
  }

  // Leave requests — filter theo ngày TẠO đơn (created_at), không phải leave_date
  const leaveRows: LeaveRow[] = [];
  if (type === "leave" || type === "all") {
    let q = admin
      .from("leave_requests")
      .select("id, created_at, leave_date, category, duration, duration_unit, start_time, end_time, reason, status, employees(name, email, home_office_id, offices:home_office_id(approver_email))")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);
    if (pendingOnly) q = q.eq("status", "pending");
    if (employeeFilter) q = q.eq("employee_id", employeeFilter);
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
        start_time: r.start_time,
        end_time: r.end_time,
        reason: r.reason,
        status: (r.status ?? "pending") as LeaveStatus,
        approver_email: approver,
      });
    }
  }

  // Violation reports — tab riêng, hoặc gộp ở "all"
  const violationRows: ViolationRow[] = [];
  if (type === "violation" || type === "all") {
    let q = admin
      .from("violation_reports")
      .select("id, created_at, kind, report_date, total_amount, reason, status, violation_items(description, amount, position), employees(name, email, home_office_id, offices:home_office_id(approver_email))")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);
    if (pendingOnly) q = q.eq("status", "pending");
    if (employeeFilter) q = q.eq("employee_id", employeeFilter);
    const { data } = await q;
    for (const r of data ?? []) {
      // @ts-expect-error — supabase nested join
      const approver: string | null = r.employees?.offices?.approver_email ?? null;
      const items = ((r.violation_items ?? []) as Pick<ViolationItem, "description" | "amount" | "position">[])
        .map((it) => ({ description: it.description, amount: Number(it.amount), position: it.position }))
        .sort((a, b) => a.position - b.position);
      violationRows.push({
        type: "violation",
        id: r.id,
        at: r.created_at as string,
        // @ts-expect-error — join
        employee: r.employees,
        kind: ((r.kind ?? "violation") as ViolationKind),
        report_date: r.report_date,
        total_amount: Number(r.total_amount),
        reason: r.reason,
        status: (r.status ?? "pending") as ViolationStatus,
        approver_email: approver,
        items,
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
      .range(rangeFrom, rangeTo);
    if (pendingOnly) q = q.eq("status", "pending");
    if (employeeFilter) q = q.eq("employee_id", employeeFilter);
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
        .select("employee_id, leave_date, status, category, start_time")
        .in("employee_id", empIds)
        .gte("leave_date", dates[0])
        .lte("leave_date", dates[dates.length - 1])
        .eq("status", "approved")
        .neq("category", "leave_hourly"); // hourly không auto-excuse
      for (const c of covers ?? []) {
        // online_wfh ca sáng/chiều + leave_paid nửa ngày (start_time có) cũng không cover full day
        if ((c.category === "online_wfh" || c.category === "leave_paid") && c.start_time) continue;
        leaveCoverSet.add(`${c.employee_id}|${c.leave_date}`);
      }
    }
  }

  const rows: Row[] = [...checkInsRows, ...leaveRows, ...overtimeRows, ...violationRows].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  // Có thể còn page tiếp nếu BẤT KỲ source nào trả về đủ PAGE_SIZE record.
  // Conservative: hiện "Trang sau" — nếu sang trang trống thì NV biết hết data.
  const hasMore =
    checkInsRows.length === PAGE_SIZE ||
    leaveRows.length === PAGE_SIZE ||
    overtimeRows.length === PAGE_SIZE ||
    violationRows.length === PAGE_SIZE;

  const baseParams = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (sp.office) baseParams.set("office", sp.office);
  if (employeeFilter) baseParams.set("employee", employeeFilter);
  const exportHref = `/api/history/export?${baseParams.toString()}`;

  const pageHref = (p: number) => {
    const u = new URLSearchParams();
    if (sp.from) u.set("from", sp.from);
    if (sp.to) u.set("to", sp.to);
    if (sp.office) u.set("office", sp.office);
    if (sp.employee) u.set("employee", sp.employee);
    if (sp.type) u.set("type", sp.type);
    if (sp.status) u.set("status", sp.status);
    if (p > 1) u.set("page", String(p));
    return `/admin/history${u.toString() ? "?" + u.toString() : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">
          {pendingOnly ? "Đơn chờ duyệt" : "Lịch sử"}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingOnly && (
            <a
              href="/admin/history"
              className="text-xs font-medium text-neutral-500 hover:text-neutral-700 underline underline-offset-2 whitespace-nowrap"
            >
              ← Xem tất cả lịch sử
            </a>
          )}
          <AddCheckInModal
            employees={(employeesList ?? []).map((e) => ({
              id: e.id, name: e.name, email: e.email,
              home_office_id: (e as { home_office_id?: string | null }).home_office_id ?? null,
            }))}
            offices={(offices ?? []).map((o) => ({ id: o.id, name: o.name }))}
            action={createManualCheckIn}
          />
          <a href={exportHref}>
            <Button size="sm" variant="secondary">
              <Download size={14} /> Excel
            </Button>
          </a>
        </div>
      </div>

      <TypeTabs current={type} sp={sp} />

      <form action="/admin/history" className="flex flex-wrap gap-2 rounded-2xl border border-white/60 glass p-3">
        <input type="hidden" name="type" value={type} />
        <FilterInput icon={Calendar} name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} />
        <FilterInput icon={Calendar} name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} />
        <div className="relative flex-1 min-w-[160px]">
          <Users size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <select
            name="employee"
            defaultValue={sp.employee ?? ""}
            className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Tất cả nhân viên</option>
            {employeesList?.map((e) => (
              <option key={e.id} value={e.id}>{e.name}{!e.is_active && " (đã xoá)"}</option>
            ))}
          </select>
        </div>
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
        page > 1 ? (
          <Empty icon={Inbox} title="Hết dữ liệu" description="Đã xem hết các trang trước." />
        ) : (
          <Empty icon={Inbox} title="Không có dữ liệu" description="Điều chỉnh bộ lọc hoặc thời gian." />
        )
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            if (r.type === "checkin") {
              return (
                <CheckInCard
                  key={`c:${r.id}`}
                  row={r}
                  onDelete={deleteCheckIn}
                  onEdit={updateCheckIn}
                  hasLeave={!!r.employee && leaveCoverSet.has(`${r.employee.id}|${r.dateVN}`)}
                />
              );
            }
            if (r.type === "leave") {
              return <LeaveCard key={`l:${r.id}`} row={r} onDelete={deleteLeave} onDecide={decideLeave} viewerEmail={viewerEmail} />;
            }
            if (r.type === "overtime") {
              return <OvertimeCard key={`o:${r.id}`} row={r} onDelete={deleteOvertime} onDecide={decideOvertime} viewerEmail={viewerEmail} />;
            }
            return <ViolationCard key={`v:${r.id}`} row={r} onDelete={deleteViolation} onDecide={decideViolation} viewerEmail={viewerEmail} />;
          })}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between gap-3 pt-2">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              prefetch={false}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-sm font-medium border border-neutral-200 bg-white hover:bg-neutral-50"
            >
              ← Trang trước
            </Link>
          ) : <span />}
          <span className="text-xs text-neutral-500">Trang {page}</span>
          {hasMore ? (
            <Link
              href={pageHref(page + 1)}
              prefetch={false}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-sm font-medium border border-neutral-200 bg-white hover:bg-neutral-50"
            >
              Trang sau →
            </Link>
          ) : <span />}
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
  sp: { from?: string; to?: string; office?: string; employee?: string };
}) {
  const tabs = [
    { key: "all", label: "Tất cả", icon: Inbox },
    { key: "checkin", label: "Chấm công · OT", icon: Fingerprint },
    { key: "leave", label: "Xin nghỉ", icon: CalendarOff },
    { key: "violation", label: "Thưởng / Vi phạm", icon: ShieldAlert },
  ];
  const make = (k: string) => {
    const p = new URLSearchParams();
    if (k !== "all") p.set("type", k);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (sp.office && (k === "checkin" || k === "all")) p.set("office", sp.office);
    if (sp.employee) p.set("employee", sp.employee);
    return `/admin/history${p.toString() ? "?" + p.toString() : ""}`;
  };
  return (
    <div className="overflow-x-auto -mx-2 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                "inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition shrink-0 whitespace-nowrap",
                active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700",
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

function CheckInCard({
  row: r,
  onDelete,
  onEdit,
  hasLeave,
}: {
  row: CheckInRow;
  onDelete: (fd: FormData) => void;
  onEdit: (fd: FormData) => void;
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
          {r.manual && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
              Thủ công
            </span>
          )}
          {r.edited_at && !r.manual && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600"
              title={`Sửa bởi ${r.edited_by ?? "?"}${r.edit_reason ? ` · ${r.edit_reason}` : ""}`}
            >
              Đã sửa
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
      <div className="flex flex-col gap-1.5 self-start">
        <EditCheckInModal
          checkInId={r.id}
          initialKind={r.kind}
          initialAtIso={r.at}
          employeeName={r.employee?.name ?? "?"}
          action={onEdit}
        />
        <form action={onDelete}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="selfie_path" value={r.selfie_path} />
          <SubmitButton className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50 font-medium transition select-none disabled:cursor-not-allowed">
            <Trash2 size={14} />
          </SubmitButton>
        </form>
      </div>
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
            {r.category === "leave_hourly" && r.start_time && r.end_time && (
              <span className="text-neutral-500 tabular-nums"> · {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</span>
            )}
            {(r.category === "online_wfh" || r.category === "leave_paid") && r.start_time && (
              <span className="text-neutral-500"> · {Number(r.start_time.slice(0, 2)) < 12 ? "Ca sáng" : "Ca chiều"}</span>
            )}
          </div>
          {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
          <div className="text-[10px] text-neutral-400 mt-1">Nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}</div>
        </div>
        <form action={onDelete} className="self-start">
          <input type="hidden" name="id" value={r.id} />
          <SubmitButton className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50 font-medium transition select-none disabled:cursor-not-allowed">
            <Trash2 size={14} />
          </SubmitButton>
        </form>
      </div>

      {r.status === "pending" && (
        canDecide ? (
          <div className="flex gap-2 pt-3 mt-3 border-t border-neutral-200/60">
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="approved" />
              <SubmitButton className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed">
                <Check size={14} /> Duyệt
              </SubmitButton>
            </form>
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="rejected" />
              <SubmitButton className="w-full h-9 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-medium inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-60">
                <X size={14} /> Từ chối
              </SubmitButton>
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
          <SubmitButton className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50 font-medium transition select-none disabled:cursor-not-allowed">
            <Trash2 size={14} />
          </SubmitButton>
        </form>
      </div>

      {r.status === "pending" && (
        canDecide ? (
          <div className="flex gap-2 pt-3 mt-3 border-t border-neutral-200/60">
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="approved" />
              <SubmitButton className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed">
                <Check size={14} /> Duyệt
              </SubmitButton>
            </form>
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="rejected" />
              <SubmitButton className="w-full h-9 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-medium inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-60">
                <X size={14} /> Từ chối
              </SubmitButton>
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

function ViolationCard({
  row: r,
  onDelete,
  onDecide,
  viewerEmail,
}: {
  row: ViolationRow;
  onDelete: (fd: FormData) => void;
  onDecide: (fd: FormData) => void;
  viewerEmail: string;
}) {
  const canDecide = !r.approver_email || r.approver_email.toLowerCase() === viewerEmail;
  const isBonus = r.kind === "bonus";
  const tone = isBonus
    ? { iconBg: "bg-emerald-50 text-emerald-600", badge: "bg-emerald-50 text-emerald-700", amount: "text-emerald-700", label: "Thưởng", Icon: Sparkles, unit: "mục", sign: "+" }
    : { iconBg: "bg-rose-50 text-rose-600", badge: "bg-rose-50 text-rose-700", amount: "text-rose-700", label: "Vi phạm", Icon: ShieldAlert, unit: "lỗi", sign: "" };
  return (
    <div className="rounded-2xl border border-white/60 glass p-3">
      <div className="flex gap-3">
        <div className={cn("h-16 w-16 rounded-xl flex items-center justify-center shrink-0", tone.iconBg)}>
          <tone.Icon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded", tone.badge)}>
              <tone.Icon size={10} /> {tone.label}
            </span>
            <ViolationStatusBadge status={r.status} />
            {r.status === "pending" && r.approver_email && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                Duyệt: {r.approver_email}
              </span>
            )}
          </div>
          <div className="font-medium truncate mt-0.5">{r.employee?.name ?? "?"}</div>
          <div className="text-xs text-neutral-500 truncate">{r.employee?.email}</div>
          <div className="mt-1 text-xs text-neutral-700">
            <span className="font-medium">{formatVN(r.report_date + "T00:00:00+07:00", "d/M")}</span>
            <span className="text-neutral-500"> · {r.items.length} {tone.unit} · </span>
            <span className={cn("font-semibold tabular-nums", tone.amount)}>{tone.sign}{r.total_amount.toLocaleString("en-US")} VND</span>
          </div>
          {r.items.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {r.items.map((it, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 min-w-0 truncate text-neutral-700">{it.description}</span>
                  <span className={cn("font-medium tabular-nums shrink-0", tone.amount)}>
                    {tone.sign}{it.amount.toLocaleString("en-US")} VND
                  </span>
                </li>
              ))}
            </ul>
          )}
          {r.reason && <div className="text-xs text-neutral-600 mt-1 line-clamp-2">{r.reason}</div>}
          <div className="text-[10px] text-neutral-400 mt-1">Nộp {formatDistanceToNow(new Date(r.at), { addSuffix: true, locale: vi })}</div>
        </div>
        <form action={onDelete} className="self-start">
          <input type="hidden" name="id" value={r.id} />
          <SubmitButton className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50 font-medium transition select-none disabled:cursor-not-allowed">
            <Trash2 size={14} />
          </SubmitButton>
        </form>
      </div>

      {r.status === "pending" && (
        canDecide ? (
          <div className="flex gap-2 pt-3 mt-3 border-t border-neutral-200/60">
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="approved" />
              <SubmitButton className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed">
                <Check size={14} /> Duyệt
              </SubmitButton>
            </form>
            <form action={onDecide} className="flex-1">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="rejected" />
              <SubmitButton className="w-full h-9 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-medium inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-60">
                <X size={14} /> Từ chối
              </SubmitButton>
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

function ViolationStatusBadge({ status }: { status: ViolationStatus }) {
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
