/**
 * Telegram bot helpers.
 * Env:
 *   TELEGRAM_BOT_TOKEN    — token từ @BotFather
 *   TELEGRAM_CHAT_IDS     — chat ids nhận thông báo, phân cách dấu phẩy
 *   TELEGRAM_WEBHOOK_SECRET — secret header Telegram gửi kèm callback
 */

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

type SendOpts = {
  replyMarkup?: InlineKeyboard;
  parseMode?: "HTML" | "MarkdownV2";
};

type SendResult =
  | { sent: 0; skipped: true }
  | { sent: number; total: number; messages: Array<{ chat_id: string; message_id: number }> };

export async function sendTelegram(text: string, opts: SendOpts = {}): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token || chatIds.length === 0) {
    console.log("[telegram] skipped — missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_IDS");
    return { sent: 0, skipped: true };
  }

  const messages: Array<{ chat_id: string; message_id: number }> = [];
  await Promise.all(
    chatIds.map(async (chat_id) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            text,
            parse_mode: opts.parseMode ?? "HTML",
            disable_web_page_preview: true,
            reply_markup: opts.replyMarkup,
          }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          messages.push({ chat_id, message_id: data.result.message_id });
        } else {
          console.error("[telegram]", chat_id, data);
        }
      } catch (e) {
        console.error("[telegram] fetch error", e);
      }
    }),
  );

  return { sent: messages.length, total: chatIds.length, messages };
}

export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  opts: SendOpts = {},
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: opts.parseMode ?? "HTML",
        reply_markup: opts.replyMarkup,
      }),
    });
  } catch (e) {
    console.error("[telegram] edit error", e);
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (e) {
    console.error("[telegram] answer error", e);
  }
}

export function htmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
