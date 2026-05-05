import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { logServerError } from "@/lib/log-server";

/**
 * Xoá data history cũ để giữ DB nhẹ. Cron chạy nightly sau khi backup xong.
 *
 * Default 300 ngày cho data nghiệp vụ (check-ins, leave, OT, violations, alerts).
 * Error logs chỉ giữ 30 ngày (debug data, không cần lâu).
 *
 * Auth:
 *   - Header `X-Admin-Secret: $AUDIT_CRON_SECRET` (cho cron) hoặc
 *   - Session admin (gọi từ UI)
 *
 * Body (optional JSON):
 *   { "history_days": 300, "log_days": 30, "dry_run": false }
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
    log_days?: number;
    dry_run?: boolean;
  };
  const historyDays = Math.max(30, Math.min(3650, body.history_days ?? 300));
  const logDays = Math.max(7, Math.min(365, body.log_days ?? 30));
  const dryRun = !!body.dry_run;

  const cutoffHistory = new Date(Date.now() - historyDays * 86400_000);
  const cutoffLog = new Date(Date.now() - logDays * 86400_000);
  const cutoffHistoryDate = cutoffHistory.toISOString().slice(0, 10); // YYYY-MM-DD cho cột date
  const cutoffHistoryIso = cutoffHistory.toISOString();
  const cutoffLogIso = cutoffLog.toISOString();

  const admin = createAdminClient();
  const result = {
    cutoff_history: cutoffHistoryDate,
    cutoff_log: cutoffLogIso,
    dry_run: dryRun,
    deleted: {
      check_ins: 0,
      selfie_files: 0,
      leave_requests: 0,
      overtime_requests: 0,
      violation_reports: 0,
      alerts: 0,
      error_logs: 0,
    },
  };

  try {
    // 1. check_ins — xoá selfie file trước (Storage không tự cascade), rồi xoá row.
    const { data: oldCheckIns } = await admin
      .from("check_ins")
      .select("id, selfie_path")
      .lt("checked_in_at", cutoffHistoryIso);
    const selfiePaths = (oldCheckIns ?? []).map((c) => c.selfie_path).filter(Boolean) as string[];
    result.deleted.check_ins = oldCheckIns?.length ?? 0;
    result.deleted.selfie_files = selfiePaths.length;

    if (!dryRun) {
      // Xoá Storage theo batch 1000 (giới hạn Supabase API)
      for (let i = 0; i < selfiePaths.length; i += 1000) {
        const batch = selfiePaths.slice(i, i + 1000);
        const { error: rmErr } = await admin.storage.from("selfies").remove(batch);
        if (rmErr) logServerError(rmErr, { where: "cleanup-history.storage.selfies" });
      }
      const { error: e1 } = await admin.from("check_ins").delete().lt("checked_in_at", cutoffHistoryIso);
      if (e1) throw new Error(`check_ins: ${e1.message}`);
    }

    // 2. leave_requests
    const { count: leaveCount } = await admin
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .lt("leave_date", cutoffHistoryDate);
    result.deleted.leave_requests = leaveCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("leave_requests").delete().lt("leave_date", cutoffHistoryDate);
      if (e) throw new Error(`leave_requests: ${e.message}`);
    }

    // 3. overtime_requests
    const { count: otCount } = await admin
      .from("overtime_requests")
      .select("id", { count: "exact", head: true })
      .lt("ot_date", cutoffHistoryDate);
    result.deleted.overtime_requests = otCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("overtime_requests").delete().lt("ot_date", cutoffHistoryDate);
      if (e) throw new Error(`overtime_requests: ${e.message}`);
    }

    // 4. violation_reports — cascade xoá violation_items
    const { count: vCount } = await admin
      .from("violation_reports")
      .select("id", { count: "exact", head: true })
      .lt("report_date", cutoffHistoryDate);
    result.deleted.violation_reports = vCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("violation_reports").delete().lt("report_date", cutoffHistoryDate);
      if (e) throw new Error(`violation_reports: ${e.message}`);
    }

    // 5. alerts
    const { count: aCount } = await admin
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .lt("alert_date", cutoffHistoryDate);
    result.deleted.alerts = aCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("alerts").delete().lt("alert_date", cutoffHistoryDate);
      if (e) throw new Error(`alerts: ${e.message}`);
    }

    // 6. error_logs (chu kỳ ngắn hơn — log không cần giữ lâu)
    const { count: lCount } = await admin
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoffLogIso);
    result.deleted.error_logs = lCount ?? 0;
    if (!dryRun) {
      const { error: e } = await admin.from("error_logs").delete().lt("created_at", cutoffLogIso);
      if (e) throw new Error(`error_logs: ${e.message}`);
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
