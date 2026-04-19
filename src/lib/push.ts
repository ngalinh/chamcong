import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const contactEmail = process.env.VAPID_EMAIL ?? "admin@example.com";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!publicKey || !privateKey) {
    console.log("[push] skipped — missing VAPID keys");
    return false;
  }
  webpush.setVapidDetails(`mailto:${contactEmail}`, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

export async function sendPushToEmployee(employeeId: string, payload: PushPayload) {
  if (!ensureConfigured()) return { sent: 0, skipped: true };

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("employee_id", employeeId);

  if (!subs?.length) return { sent: 0, total: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired / gone — clean up
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("[push] send error", e);
        }
      }
    }),
  );
  return { sent, total: subs.length };
}

export async function sendPushToAdmins(payload: PushPayload) {
  if (!ensureConfigured()) return { sent: 0, skipped: true };

  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("employees")
    .select("id")
    .eq("is_admin", true)
    .eq("is_active", true);

  if (!admins?.length) return { sent: 0, total: 0 };

  let totalSent = 0;
  for (const a of admins) {
    const r = await sendPushToEmployee(a.id, payload);
    if ("sent" in r) totalSent += r.sent;
  }
  return { sent: totalSent, admins: admins.length };
}
