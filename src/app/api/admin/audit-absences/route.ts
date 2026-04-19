import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

/**
 * Đối chiếu check-in ↔ leave_requests cho 1 tháng.
 * Với mỗi ngày làm việc (T2-T6) trong tháng, với mỗi nhân viên active:
 *   - Nếu không có check-in nào VÀ không có leave_request nào → tạo alert.
 * Idempotent: dùng unique (employee_id, alert_date, kind) nên chạy lại không trùng.
 *
 * Query params:
 *   - month=YYYY-MM (default: tháng trước)
 *
 * Có thể gọi thủ công từ admin UI, hoặc qua cron (vd Vercel cron) với header
 *   X-Admin-Secret: $AUDIT_CRON_SECRET
 */

function isWeekday(d: Date) {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

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
  let monthStr = url.searchParams.get("month");
  if (!monthStr) {
    // Default = tháng trước
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    monthStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const m = monthStr.match(/^(\d{4})-(\d{2})$/);
  if (!m) return NextResponse.json({ error: "month phải dạng YYYY-MM" }, { status: 400 });
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // ngày cuối tháng
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const admin = createAdminClient();

  // 1. Lấy tất cả nhân viên active (tạo trước hoặc trong tháng)
  const { data: employees } = await admin
    .from("employees")
    .select("id, name, email, created_at")
    .eq("is_active", true);
  if (!employees?.length) return NextResponse.json({ ok: true, created: 0, message: "Không có nhân viên active" });

  // 2. Lấy tất cả check-ins trong tháng → map Set<string> theo employee_id
  const { data: checkIns } = await admin
    .from("check_ins")
    .select("employee_id, checked_in_at")
    .gte("checked_in_at", start.toISOString())
    .lt("checked_in_at", new Date(Date.UTC(year, month, 1)).toISOString());
  const checkInSet = new Set<string>();
  for (const ci of checkIns ?? []) {
    const d = new Date(ci.checked_in_at as string);
    const key = `${ci.employee_id}|${ymd(d)}`;
    checkInSet.add(key);
  }

  // 3. Lấy tất cả leave_requests trong tháng
  const { data: leaves } = await admin
    .from("leave_requests")
    .select("employee_id, leave_date")
    .gte("leave_date", ymd(start))
    .lte("leave_date", ymd(end));
  const leaveSet = new Set<string>();
  for (const lr of leaves ?? []) {
    leaveSet.add(`${lr.employee_id}|${lr.leave_date}`);
  }

  // 4. Duyệt từng ngày × nhân viên → tìm missing
  const missing: Array<{ employee_id: string; alert_date: string; kind: string; message: string }> = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (isWeekday(cursor) && cursor < today) {
      const dateStr = ymd(cursor);
      for (const e of employees) {
        // Bỏ qua nếu nhân viên tạo sau ngày này
        if (new Date(e.created_at).toISOString().slice(0, 10) > dateStr) continue;
        const key = `${e.id}|${dateStr}`;
        if (!checkInSet.has(key) && !leaveSet.has(key)) {
          missing.push({
            employee_id: e.id,
            alert_date: dateStr,
            kind: "missing_checkin",
            message: `${e.name} không chấm công và không có đơn xin nghỉ ngày ${dateStr}`,
          });
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (missing.length === 0) {
    return NextResponse.json({ ok: true, month: monthStr, created: 0 });
  }

  // 5. Insert vào alerts, bỏ qua trùng
  const { error, count } = await admin
    .from("alerts")
    .upsert(missing, { onConflict: "employee_id,alert_date,kind", ignoreDuplicates: true, count: "exact" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, month: monthStr, checked: missing.length, created: count ?? 0 });
}
