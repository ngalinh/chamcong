import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const Schema = z.object({
  leave_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
  category: z.enum([
    "online_rain",
    "online_wfh",
    "online_paid",
    "leave_hourly",
    "leave_paid",
    "leave_unpaid",
  ]),
  duration: z.number().positive().max(30),
  duration_unit: z.enum(["day", "hour"]),
  reason: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, name, email, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!emp || !emp.is_active)
    return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  const { error } = await admin.from("leave_requests").insert({
    employee_id: emp.id,
    leave_date: data.leave_date,
    category: data.category,
    duration: data.duration,
    duration_unit: data.duration_unit,
    reason: data.reason ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tự resolve alert missing_checkin nếu có
  await admin
    .from("alerts")
    .update({ resolved: true })
    .eq("employee_id", emp.id)
    .eq("alert_date", data.leave_date)
    .eq("kind", "missing_checkin");

  return NextResponse.json({ ok: true });
}
