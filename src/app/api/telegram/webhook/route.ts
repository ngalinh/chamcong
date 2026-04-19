import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerCallbackQuery, editTelegramMessage, htmlEscape } from "@/lib/telegram";
import { sendMail } from "@/lib/email";
import { LEAVE_CATEGORIES, type LeaveStatus } from "@/types/db";
import { formatVN } from "@/lib/time";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Verify bằng secret header Telegram gửi
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const update = await request.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });

  // Chỉ xử lý callback_query (click nút inline)
  const cb = update.callback_query;
  if (!cb?.data) return NextResponse.json({ ok: true });

  const [action, leaveId] = String(cb.data).split(":");
  if (!leaveId || (action !== "approve" && action !== "reject")) {
    await answerCallbackQuery(cb.id, "Action không hợp lệ");
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { data: leave } = await admin
    .from("leave_requests")
    .select("id, status, leave_date, category, duration, duration_unit, reason, employees(name, email)")
    .eq("id", leaveId)
    .maybeSingle();

  if (!leave) {
    await answerCallbackQuery(cb.id, "Đơn không tồn tại");
    return NextResponse.json({ ok: true });
  }

  // @ts-expect-error — supabase join
  const emp = leave.employees as { name: string; email: string } | null;
  if (!emp) {
    await answerCallbackQuery(cb.id, "Thiếu thông tin nhân viên");
    return NextResponse.json({ ok: true });
  }

  if (leave.status !== "pending") {
    await answerCallbackQuery(cb.id, `Đơn đã được ${leave.status === "approved" ? "duyệt" : "từ chối"} trước đó`);
    return NextResponse.json({ ok: true });
  }

  const admin_tg_name = `${cb.from?.first_name ?? ""} ${cb.from?.last_name ?? ""}`.trim();
  const newStatus: LeaveStatus = action === "approve" ? "approved" : "rejected";

  // Update DB
  await admin
    .from("leave_requests")
    .update({
      status: newStatus,
      approved_at: new Date().toISOString(),
      approved_by: admin_tg_name || `tg:${cb.from?.id}`,
    })
    .eq("id", leaveId);

  // Edit lại tin nhắn Telegram để bỏ nút, thêm status
  const chat_id = cb.message?.chat?.id;
  const message_id = cb.message?.message_id;
  const statusLine = newStatus === "approved"
    ? `\n\n✅ <b>Đã duyệt</b> bởi ${htmlEscape(admin_tg_name || "admin")}`
    : `\n\n❌ <b>Từ chối</b> bởi ${htmlEscape(admin_tg_name || "admin")}`;
  if (chat_id && message_id) {
    const original = cb.message?.text ?? "";
    // message trong telegram không có HTML entities, cần escape lại
    await editTelegramMessage(chat_id, message_id, htmlEscape(original) + statusLine);
  }

  // Gửi email cho nhân viên nếu đã duyệt
  if (newStatus === "approved") {
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
    sendMail({
      to: emp.email,
      subject: "✅ Đơn xin nghỉ đã được duyệt",
      html,
    }).catch((e) => console.error("[email] failed", e));
  }

  await answerCallbackQuery(cb.id, newStatus === "approved" ? "Đã duyệt ✅" : "Đã từ chối ❌");
  return NextResponse.json({ ok: true });
}
