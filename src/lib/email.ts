import nodemailer from "nodemailer";

/**
 * Gửi email từ cskh@basso.vn qua Gmail SMTP.
 * Env:
 *   CSKH_EMAIL            — vd cskh@basso.vn
 *   CSKH_APP_PASSWORD     — Gmail App Password (16 ký tự, space-separated)
 *                           Tạo tại https://myaccount.google.com/apppasswords
 */
export async function sendMail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const user = process.env.CSKH_EMAIL;
  const pass = process.env.CSKH_APP_PASSWORD;

  if (!user || !pass) {
    console.log("[email] skipped — missing CSKH_EMAIL/CSKH_APP_PASSWORD");
    return { sent: false };
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: pass.replace(/\s+/g, "") },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Chấm công Basso" <${user}>`,
      to,
      subject,
      html,
      replyTo: replyTo ?? user,
    });
    console.log("[email] sent", info.messageId, "→", to);
    return { sent: true, messageId: info.messageId };
  } catch (e) {
    console.error("[email] error", e);
    return { sent: false, error: String(e) };
  }
}
