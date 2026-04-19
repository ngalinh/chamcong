import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegram, htmlEscape } from "@/lib/telegram";
import { LEAVE_CATEGORIES } from "@/types/db";

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

  const { data: inserted, error } = await admin
    .from("leave_requests")
    .insert({
      employee_id: emp.id,
      leave_date: data.leave_date,
      category: data.category,
      duration: data.duration,
      duration_unit: data.duration_unit,
      reason: data.reason ?? null,
    })
    .select("id")
    .single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Lỗi DB" }, { status: 500 });

  // Auto-resolve alert missing_checkin nếu có
  await admin
    .from("alerts")
    .update({ resolved: true })
    .eq("employee_id", emp.id)
    .eq("alert_date", data.leave_date)
    .eq("kind", "missing_checkin");

  // Gửi Telegram với nút Xác nhận
  const lines = [
    "🗓 <b>Đơn xin nghỉ mới</b>",
    `👤 ${htmlEscape(emp.name)} (${htmlEscape(emp.email)})`,
    `📅 Ngày: <b>${htmlEscape(data.leave_date)}</b>`,
    `🏷 Loại: ${htmlEscape(LEAVE_CATEGORIES[data.category])}`,
    `⏱ Thời gian: <b>${data.duration} ${data.duration_unit === "day" ? "ngày" : "giờ"}</b>`,
  ];
  if (data.reason) lines.push(`💬 Lý do: ${htmlEscape(data.reason)}`);

  const result = await sendTelegram(lines.join("\n"), {
    replyMarkup: {
      inline_keyboard: [[
        { text: "✅ Xác nhận duyệt", callback_data: `approve:${inserted.id}` },
        { text: "❌ Từ chối",         callback_data: `reject:${inserted.id}` },
      ]],
    },
  });

  // Lưu message_id để webhook update lại tin nhắn sau khi admin click
  if ("messages" in result && result.messages.length > 0) {
    const first = result.messages[0];
    await admin
      .from("leave_requests")
      .update({
        telegram_message_id: first.message_id,
        telegram_chat_id: Number(first.chat_id),
      })
      .eq("id", inserted.id);
  }

  return NextResponse.json({ ok: true });
}
