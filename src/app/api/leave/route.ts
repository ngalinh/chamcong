import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToAdmins } from "@/lib/push";
import { LEAVE_CATEGORIES } from "@/types/db";

export const runtime = "nodejs";

const TimeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Giờ không hợp lệ");

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
  start_time: TimeStr.nullable().optional(),
  end_time:   TimeStr.nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
}).refine(
  (d) => d.category !== "leave_hourly" || (d.start_time && d.end_time),
  { message: "Nghỉ theo giờ phải có thời gian bắt đầu + kết thúc" },
);

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
    start_time: data.category === "leave_hourly" ? data.start_time ?? null : null,
    end_time:   data.category === "leave_hourly" ? data.end_time   ?? null : null,
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

  // Push notification tới admin (fire-and-forget)
  sendPushToAdmins({
    title: "📋 Đơn xin nghỉ mới",
    body: `${emp.name}: ${LEAVE_CATEGORIES[data.category]} — ngày ${data.leave_date} (${data.duration} ${data.duration_unit === "day" ? "ngày" : "giờ"})`,
    url: "/admin/history?type=leave",
    tag: `leave-new-${emp.id}`,
  }).catch((e) => console.error("[push] admin notify failed", e));

  return NextResponse.json({ ok: true });
}
