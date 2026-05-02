import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { buildHistoryWorkbook, type ExportCheckIn, type ExportOvertime, type ExportLeave, type ExportViolation } from "@/lib/excel-export";
import { formatVN } from "@/lib/time";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("employees")
    .select("id, is_admin, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isAdmin = me.is_admin || isAdminEmail(user.email);

  const url = new URL(request.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const officeId = url.searchParams.get("office");
  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "Thiếu from/to" }, { status: 400 });
  }
  const fromIso = new Date(fromStr).toISOString();
  const toIso = new Date(toStr).toISOString();
  // Cho leave_date / report_date: dùng date string
  const fromDate = fromStr.slice(0, 10);
  const toDate = toStr.slice(0, 10);

  const admin = createAdminClient();

  // Build queries — filter theo employee_id nếu NV, không filter nếu admin
  const ownerFilter = isAdmin ? null : me.id;

  let qCheckIns = admin
    .from("check_ins")
    .select("id, kind, checked_in_at, late_minutes, early_minutes, distance_m, face_match_score, employees(name, email), offices(name, is_remote)")
    .gte("checked_in_at", fromIso)
    .lte("checked_in_at", toIso)
    .order("checked_in_at", { ascending: false })
    .limit(10000);
  if (ownerFilter) qCheckIns = qCheckIns.eq("employee_id", ownerFilter);
  if (isAdmin && officeId) qCheckIns = qCheckIns.eq("office_id", officeId);

  let qOvertimes = admin
    .from("overtime_requests")
    .select("id, ot_date, start_time, end_time, hours, reason, status, created_at, employees(name, email)")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (ownerFilter) qOvertimes = qOvertimes.eq("employee_id", ownerFilter);

  let qLeaves = admin
    .from("leave_requests")
    .select("id, leave_date, category, duration, duration_unit, start_time, end_time, reason, status, created_at, employees(name, email)")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (ownerFilter) qLeaves = qLeaves.eq("employee_id", ownerFilter);

  let qViolations = admin
    .from("violation_reports")
    .select("id, kind, report_date, total_amount, reason, status, created_at, violation_items(description, amount, position), employees(name, email)")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (ownerFilter) qViolations = qViolations.eq("employee_id", ownerFilter);

  const [
    { data: checkInsData },
    { data: overtimesData },
    { data: leavesData },
    { data: violationsData },
  ] = await Promise.all([qCheckIns, qOvertimes, qLeaves, qViolations]);

  const checkIns: ExportCheckIn[] = (checkInsData ?? []).map((r) => ({
    id: r.id,
    kind: (r.kind ?? "in") as "in" | "out",
    checked_in_at: r.checked_in_at as string,
    // @ts-expect-error supabase nested join
    employee_name: r.employees?.name ?? null,
    // @ts-expect-error supabase nested join
    employee_email: r.employees?.email ?? null,
    // @ts-expect-error supabase nested join
    office: r.offices?.name ?? null,
    // @ts-expect-error supabase nested join
    is_remote: !!r.offices?.is_remote,
    late_minutes: r.late_minutes,
    early_minutes: r.early_minutes,
    distance_m: r.distance_m,
    face_match_score: r.face_match_score,
  }));

  const overtimes: ExportOvertime[] = (overtimesData ?? []).map((r) => ({
    id: r.id,
    ot_date: r.ot_date,
    start_time: r.start_time,
    end_time: r.end_time,
    hours: Number(r.hours),
    reason: r.reason,
    status: r.status,
    // @ts-expect-error supabase nested join
    employee_name: r.employees?.name ?? null,
    // @ts-expect-error supabase nested join
    employee_email: r.employees?.email ?? null,
    created_at: r.created_at as string,
  }));

  const leaves: ExportLeave[] = (leavesData ?? []).map((r) => ({
    id: r.id,
    leave_date: r.leave_date,
    category: r.category,
    duration: Number(r.duration),
    duration_unit: r.duration_unit,
    start_time: r.start_time,
    end_time: r.end_time,
    reason: r.reason,
    status: r.status,
    // @ts-expect-error supabase nested join
    employee_name: r.employees?.name ?? null,
    // @ts-expect-error supabase nested join
    employee_email: r.employees?.email ?? null,
    created_at: r.created_at as string,
  }));

  const violations: ExportViolation[] = (violationsData ?? []).map((r) => ({
    id: r.id,
    kind: (r.kind ?? "violation") as "bonus" | "violation",
    report_date: r.report_date,
    total_amount: Number(r.total_amount),
    reason: r.reason,
    status: r.status,
    items: ((r as { violation_items?: { description: string; amount: number; position: number }[] }).violation_items ?? [])
      .sort((a, b) => a.position - b.position)
      .map((it) => ({ description: it.description, amount: Number(it.amount) })),
    // @ts-expect-error supabase nested join
    employee_name: r.employees?.name ?? null,
    // @ts-expect-error supabase nested join
    employee_email: r.employees?.email ?? null,
    created_at: r.created_at as string,
  }));

  // Filter date — dùng trong rangeLabel
  void fromDate;
  void toDate;
  const rangeLabel = `${formatVN(fromIso, "dd-MM-yyyy")} - ${formatVN(toIso, "dd-MM-yyyy")}`;

  const buffer = await buildHistoryWorkbook({
    checkIns,
    overtimes,
    leaves,
    violations,
    includeEmployee: isAdmin,
    rangeLabel,
  });

  const filename = `lich-su-${isAdmin ? "all" : "nv"}-${rangeLabel}.xlsx`;

  // Ép Uint8Array → BodyInit (NextResponse chấp nhận)
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
