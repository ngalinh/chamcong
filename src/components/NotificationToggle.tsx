"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const AUTO_PROMPT_KEY = "notif-auto-prompted";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const s = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading";

export function NotificationToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const autoTried = useRef(false);

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY!),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Không lưu được subscription");
      setState("subscribed");
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      if (!PUBLIC_VAPID_KEY) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setState("subscribed");
          return;
        }
        // Permission đã granted nhưng chưa có subscription → tự subscribe ngay (không cần click)
        if (Notification.permission === "granted") {
          await subscribe();
          return;
        }
        // Permission default → tự prompt 1 lần. Nếu trình duyệt yêu cầu user gesture
        // (Safari iOS), permission sẽ vẫn là default và button sẽ hiện ra để bấm.
        setState("unsubscribed");
        if (!autoTried.current && localStorage.getItem(AUTO_PROMPT_KEY) !== "1") {
          autoTried.current = true;
          localStorage.setItem(AUTO_PROMPT_KEY, "1");
          await subscribe();
        }
      } catch {
        setState("unsupported");
      }
    })();
  }, [subscribe]);

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;
  if (state === "unsupported") return null;

  if (state === "denied") {
    return (
      <div className="flex items-center gap-3 rounded-2xl glass border border-white/60 p-4">
        <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
          <BellOff size={20} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium">Thông báo bị chặn</p>
          <p className="text-xs text-neutral-500">Vào Settings trình duyệt để bật lại</p>
        </div>
      </div>
    );
  }

  const subscribed = state === "subscribed";
  return (
    <button
      onClick={subscribed ? unsubscribe : subscribe}
      disabled={busy}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl glass border border-white/60 p-4 transition text-left",
        !busy && "hover:bg-white/80 active:scale-[0.99]",
      )}
    >
      <div className={cn(
        "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
        subscribed ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-500",
      )}>
        {busy ? <Loader2 size={20} className="animate-spin" /> : subscribed ? <Bell size={20} strokeWidth={1.8} /> : <BellOff size={20} strokeWidth={1.8} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{subscribed ? "Thông báo đã bật" : "Bật thông báo"}</p>
        <p className="text-xs text-neutral-500">
          {subscribed ? "Nhận thông báo khi có đơn duyệt, alert…" : "Duyệt đơn, alert check-in muộn…"}
        </p>
      </div>
    </button>
  );
}
