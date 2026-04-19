import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToAdmins } from "@/lib/push";

export const runtime = "nodejs";

const Schema = z.object({
  ot_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Giờ bắt đầu không hợp lệ"),
  end_time:   z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Giờ kết thúc không hợp lệ"),
  hours:      z.number().positive().max(24),
  reason:     z.string().max(500).nullable().optional(),
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

  const { error } = await admin.from("overtime_requests").insert({
    employee_id: emp.id,
    ot_date:     data.ot_date,
    start_time:  data.start_time,
    end_time:    data.end_time,
    hours:       data.hours,
    reason:      data.reason ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  sendPushToAdmins({
    title: "⏱️ Đơn làm overtime mới",
    body: `${emp.name}: ${data.ot_date} · ${data.start_time}–${data.end_time} (${data.hours}h)`,
    url: "/admin/history?type=overtime",
    tag: `overtime-new-${emp.id}`,
  }).catch((e) => console.error("[push] admin notify failed", e));

  return NextResponse.json({ ok: true });
}
