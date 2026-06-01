import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { sendPushToEmployee } from "@/lib/push";
import { effectiveWorkShifts } from "@/lib/workHours";
import { APP_TZ, timeToMinutes } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import type { WorkShift } from "@/types/db";

/**
 * Push reminder "Bạn ơi, hãy chấm công nhé! :D" cho NV active đúng vào giờ
 * bắt đầu / kết thúc ca làm (theo override của NV, fallback giờ chi nhánh).
 *
 * Cron `*\/5 * * * *` gọi POST với header `X-Admin-Secret: $AUDIT_CRON_SECRET`.
 *
 * Để tránh gửi trùng nếu cron fail rồi rerun, dedup qua bảng
 * `shift_reminders_sent` với unique (employee, ngày VN, shift_index, kind).
 *
 * Query params:
 *   - window=<phút>  (default 5) — phải khớp tần số cron
 *   - dry=1          không gửi push, chỉ trả về kết quả mô phỏng
 */

const TITLE = "Chấm công";

type EmployeeRow = {
  id: string;
  name: string;
  home_office_id: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  work_shifts: WorkShift[] | null;
  reminder_shift_indices: number[] | null;
};

type OfficeRow = {
  id: string;
  work_start_time: string;
  work_end_time: string;
};

export async function POST(request: NextRequest) {
  // Auth: admin session HOẶC secret header (cho cron)
  const secret = process.env.AUDIT_CRON_SECRET;
  const providedSecret = request.headers.get("x-admin-secret");
  let authorized = false;
  if (secret && providedSecret === secret) {
    authorized = true;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: me } = await supabase
        .from("employees")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      authorized = !!me?.is_admin || isAdminEmail(user.email);
    }
  }
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const windowMin = Math.max(1, Math.min(60, Number(url.searchParams.get("window") ?? "5")));
  const dryRun = url.searchParams.get("dry") === "1";

  const now = new Date();
  const hhmm = formatInTimeZone(now, APP_TZ, "HH:mm");
  const dateVN = formatInTimeZone(now, APP_TZ, "yyyy-MM-dd");
  const nowMin = timeToMinutes(hhmm);
  const bucketStart = Math.floor(nowMin / windowMin) * windowMin;
  const bucketEnd = bucketStart + windowMin;

  const admin = createAdminClient();

  const { data: employees } = await admin
    .from("employees")
    .select("id, name, home_office_id, work_start_time, work_end_time, work_shifts, reminder_shift_indices")
    .eq("is_active", true)
    .returns<EmployeeRow[]>();

  if (!employees?.length) {
    return NextResponse.json({ ok: true, nowVN: hhmm, dateVN, bucket: [bucketStart, bucketEnd], sent: 0, employees: 0 });
  }

  const officeIds = Array.from(
    new Set(employees.map((e) => e.home_office_id).filter((v): v is string => !!v)),
  );
  const officeMap = new Map<string, OfficeRow>();
  if (officeIds.length > 0) {
    const { data: offices } = await admin
      .from("offices")
      .select("id, work_start_time, work_end_time")
      .in("id", officeIds)
      .returns<OfficeRow[]>();
    for (const o of offices ?? []) officeMap.set(o.id, o);
  }

  const fired: Array<{ employee: string; kind: "start" | "end"; shift_index: number; shift_time: string }> = [];
  let totalSent = 0;

  for (const emp of employees) {
    const office = emp.home_office_id ? officeMap.get(emp.home_office_id) : undefined;
    const officeStart = office?.work_start_time ?? "09:00:00";
    const officeEnd = office?.work_end_time ?? "18:00:00";
    const shifts = effectiveWorkShifts(emp, officeStart, officeEnd);

    for (let i = 0; i < shifts.length; i++) {
      const shift = shifts[i];
      const startMin = timeToMinutes(shift.start);
      const endMin = timeToMinutes(shift.end);

      const matches: Array<{ kind: "start" | "end"; time: string }> = [];
      if (startMin >= bucketStart && startMin < bucketEnd) matches.push({ kind: "start", time: shift.start });
      if (endMin >= bucketStart && endMin < bucketEnd) matches.push({ kind: "end", time: shift.end });
      if (matches.length === 0) continue;

      // Bỏ qua ca không được chọn (khi NV đã tự chọn ca cụ thể)
      const enabledIndices = emp.reminder_shift_indices;
      if (enabledIndices && enabledIndices.length > 0 && !enabledIndices.includes(i)) continue;

      for (const m of matches) {
        if (!dryRun) {
          // Dedup: chèn marker trước, nếu đã có (23505 unique_violation) → skip
          const { error } = await admin.from("shift_reminders_sent").insert({
            employee_id: emp.id,
            reminder_date: dateVN,
            shift_index: i,
            kind: m.kind,
          });
          if (error) {
            if (error.code === "23505") continue;
            console.error("[shift-reminders] dedup insert error", error);
            continue;
          }

          const r = await sendPushToEmployee(emp.id, {
            title: TITLE,
            body: `${emp.name} ơi, hãy nhớ chấm công nhé ;)`,
            tag: `shift-${m.kind}-${emp.id}-${dateVN}-${i}`,
            url: "/checkin",
          });
          if ("sent" in r) totalSent += r.sent;
        }
        fired.push({ employee: emp.name, kind: m.kind, shift_index: i, shift_time: m.time });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    nowVN: hhmm,
    dateVN,
    bucket: [bucketStart, bucketEnd],
    employees: employees.length,
    fired,
    sent: totalSent,
    dryRun,
  });
}
