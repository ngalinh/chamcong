import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { logServerError } from "@/lib/log-server";
import {
  computePayrollForMonth,
  findOldestDataMonth,
  listMonthsBetween,
  monthOfDate,
} from "@/lib/payroll-snapshot";
import type { Employee } from "@/types/db";

/**
 * Xoá data history cũ để giữ DB nhẹ. Cron chạy weekly sau khi backup xong.
 *
 * Defaults:
 *   - history_days = 100  → xoá check_ins/leave/OT/violations/alerts cũ hơn,
 *     làm tròn xuống biên tháng để không xoá nửa tháng (đợi tháng sau).
 *   - selfie_days  = 50   → xoá file selfie trong Storage + clear cột
 *     selfie_path; row check_ins giữ lại để bảng lương vẫn tính đúng.
 *   - log_days     = 30   → error_logs.
 *
 * Trước khi DELETE history rows, snapshot bảng lương cho mọi (NV, tháng)
 * sắp bị xoá vào table payroll_snapshots. Bảng lương các tháng đã đóng sổ
 * vẫn hiển thị đầy đủ kể cả khi raw data đã bị xoá.
 *
 * Auth: header X-Admin-Secret: $AUDIT_CRON_SECRET hoặc session admin.
 */
export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => ({}))) as {
    history_days?: number;
    selfie_days?: number;
    log_days?: number;
    dry_run?: boolean;
  };
  const historyDays = Math.max(30, Math.min(3650, body.history_days ?? 100));
  const selfieDays = Math.max(7, Math.min(historyDays, body.selfie_days ?? 50));
  const logDays = Math.max(7, Math.min(365, body.log_days ?? 30));
  const dryRun = !!body.dry_run;

  const cutoffHistoryRaw = new Date(Date.now() - historyDays * 86400_000);
  const cutoffSelfie = new Date(Date.now() - selfieDays * 86400_000);
  const cutoffLog = new Date(Date.now() - logDays * 86400_000);

  // Round history cutoff xuống đầu tháng chứa nó → tránh partial-month.
  // VD cutoffRaw=2026-01-29 → cutoffMonth="2026-01" → xoá data < 2026-01-01.
  const cutoffHistoryMonth = monthOfDate(cutoffHistoryRaw);
  const cutoffHistoryDate = `${cutoffHistoryMonth}-01`;
  const cutoffHistoryIso = `${cutoffHistoryDate}T00:00:00+07:00`;
  const cutoffSelfieIso = cutoffSelfie.toISOString();
  const cutoffLogIso = cutoffLog.toISOString();

  const admin = createAdminClient();
  const result = {
    cutoff_history: cutoffHistoryDate,
    cutoff_selfie: cutoffSelfieIso,
    cutoff_log: cutoffLogIso,
    dry_run: dryRun,
    snapshots_created: 0,
    snapshots_skipped_existing: 0,
    selfies_cleared: 0,
    deleted: {
      check_ins: 0,
      leave_requests: 0,
      overtime_requests: 0,
      violation_reports: 0,
      alerts: 0,
      error_logs: 0,
      shift_reminders_sent: 0,
    },
  };

  try {
    // STEP 0: Snapshot bảng lương cho mọi (NV, tháng) sắp bị xoá.
    // Idempotent qua UNIQUE(employee_id, year_month) — recompute sau khi
    // data đã xoá sẽ ra rỗng/sai, nên skip nếu snapshot đã có.
    const oldestMonth = await findOldestDataMonth(admin);
    if (oldestMonth) {
      const monthsToSnapshot = listMonthsBetween(oldestMonth, cutoffHistoryMonth);
      if (monthsToSnapshot.length > 0) {
        const { data: allEmployees } = await admin
          .from("employees")
          .select("*")
          .returns<Employee[]>();
        const { data: existing } = await admin
          .from("payroll_snapshots")
          .select("employee_id, year_month")
          .in("year_month", monthsToSnapshot);
        const existingSet = new Set(
          (existing ?? []).map((s) => `${s.employee_id}|${s.year_month}`),
        );

        for (const month of monthsToSnapshot) {
          for (const emp of allEmployees ?? []) {
            const key = `${emp.id}|${month}`;
            if (existingSet.has(key)) {
              result.snapshots_skipped_existing++;
              continue;
            }
            try {
              const payload = await computePayrollForMonth(admin, emp, month);
              if (!dryRun) {
                const { error: insErr } = await admin
                  .from("payroll_snapshots")
                  .insert({
                    employee_id: emp.id,
                    year_month: month,
                    data: payload,
                  });
                if (insErr) {
                  // 23505 = unique violation (concurrent insert) — coi như ok
                  if (insErr.code !== "23505") {
                    logServerError(insErr, {
                      where: "cleanup-history.snapshot.insert",
                      employee_id: emp.id,
                      year_month: month,
                    });
                    continue;
                  }
                }
              }
              result.snapshots_created++;
            } catch (err) {
              logServerError(err, {
                where: "cleanup-history.snapshot.compute",
                employee_id: emp.id,
                year_month: month,
              });
            }
          }
        }
      }
    }

    // STEP 1: Selfie cleanup (50 ngày) — xoá file Storage + clear selfie_path,
    // GIỮ row check_ins. Phải làm trước STEP 2 để file của data sắp bị xoá
    // cũng đã được xoá khỏi Storage (cutoff_selfie > cutoff_history_month).
    const { data: oldSelfies } = await admin
      .from("check_ins")
      .select("id, selfie_path")
      .lt("checked_in_at", cutoffSelfieIso)
      .not("selfie_path", "is", null);
    const selfiePaths = (oldSelfies ?? [])
      .map((c) => c.selfie_path as string | null)
      .filter((p): p is string => !!p);
    const selfieRowIds = (oldSelfies ?? []).map((c) => c.id as string);
    result.selfies_cleared = selfiePaths.length;

    if (!dryRun && selfiePaths.length > 0) {
      // Xoá file Storage theo batch 1000 (giới hạn Supabase API)
      for (let i = 0; i < selfiePaths.length; i += 1000) {
        const batch = selfiePaths.slice(i, i + 1000);
        const { error: rmErr } = await admin.storage.from("selfies").remove(batch);
        if (rmErr) logServerError(rmErr, { where: "cleanup-history.storage.selfies" });
      }
      // Clear cột selfie_path bằng UPDATE in chunks (in() giới hạn ~1000 ids)
      for (let i = 0; i < selfieRowIds.length; i += 500) {
        const batch = selfieRowIds.slice(i, i + 500);
        const { error: upErr } = await admin
          .from("check_ins")
          .update({ selfie_path: null })
          .in("id", batch);
        if (upErr) logServerError(upErr, { where: "cleanup-history.update.selfie_path" });
      }
    }

    // STEP 2: Xoá history rows > 100 ngày (làm tròn xuống biên tháng).
    // check_ins ở khoảng này selfie_path đã null từ STEP 1.
    const { count: ciCount } = await admin
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .lt("checked_in_at", cutoffHistoryIso);
    result.deleted.check_ins = ciCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("check_ins").delete().lt("checked_in_at", cutoffHistoryIso);
      if (e) throw new Error(`check_ins: ${e.message}`);
    }

    const { count: leaveCount } = await admin
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .lt("leave_date", cutoffHistoryDate);
    result.deleted.leave_requests = leaveCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("leave_requests").delete().lt("leave_date", cutoffHistoryDate);
      if (e) throw new Error(`leave_requests: ${e.message}`);
    }

    const { count: otCount } = await admin
      .from("overtime_requests")
      .select("id", { count: "exact", head: true })
      .lt("ot_date", cutoffHistoryDate);
    result.deleted.overtime_requests = otCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("overtime_requests").delete().lt("ot_date", cutoffHistoryDate);
      if (e) throw new Error(`overtime_requests: ${e.message}`);
    }

    const { count: vCount } = await admin
      .from("violation_reports")
      .select("id", { count: "exact", head: true })
      .lt("report_date", cutoffHistoryDate);
    result.deleted.violation_reports = vCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("violation_reports").delete().lt("report_date", cutoffHistoryDate);
      if (e) throw new Error(`violation_reports: ${e.message}`);
    }

    const { count: aCount } = await admin
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .lt("alert_date", cutoffHistoryDate);
    result.deleted.alerts = aCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("alerts").delete().lt("alert_date", cutoffHistoryDate);
      if (e) throw new Error(`alerts: ${e.message}`);
    }

    const { count: lCount } = await admin
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoffLogIso);
    result.deleted.error_logs = lCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("error_logs").delete().lt("created_at", cutoffLogIso);
      if (e) throw new Error(`error_logs: ${e.message}`);
    }

    const { count: srCount } = await admin
      .from("shift_reminders_sent")
      .select("id", { count: "exact", head: true })
      .lt("sent_at", cutoffLogIso);
    result.deleted.shift_reminders_sent = srCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin
        .from("shift_reminders_sent")
        .delete()
        .lt("sent_at", cutoffLogIso);
      if (e) throw new Error(`shift_reminders_sent: ${e.message}`);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logServerError(e, { where: "cleanup-history", ...result });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), ...result },
      { status: 500 },
    );
  }
}
