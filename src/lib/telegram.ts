/**
 * Gửi tin nhắn Telegram qua bot.
 * Yêu cầu env:
 *   - TELEGRAM_BOT_TOKEN: token từ @BotFather
 *   - TELEGRAM_CHAT_IDS:  danh sách chat id nhận tin, phân cách bằng dấu phẩy
 *
 * Fail silent — không throw để không làm hỏng luồng chính.
 */
export async function sendTelegram(text: string, parseMode: "MarkdownV2" | "HTML" = "HTML") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token || chatIds.length === 0) {
    console.log("[telegram] skipped — missing env TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_IDS");
    return { sent: 0, skipped: true };
  }

  let sent = 0;
  await Promise.all(
    chatIds.map(async (chat_id) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            text,
            parse_mode: parseMode,
            disable_web_page_preview: true,
          }),
        });
        if (res.ok) sent++;
        else console.error("[telegram]", chat_id, "→", res.status, await res.text());
      } catch (e) {
        console.error("[telegram] fetch error", e);
      }
    }),
  );

  return { sent, total: chatIds.length };
}

/** HTML-escape — Telegram HTML parse mode yêu cầu escape 3 ký tự này. */
export function htmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
