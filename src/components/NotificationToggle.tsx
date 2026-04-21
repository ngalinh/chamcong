"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ensurePushSubscribed } from "@/lib/push-client";

type State = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading";

export function NotificationToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const autoTried = useRef(false);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
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
      setState(sub ? "subscribed" : "unsubscribed");
    } catch {
      setState("unsupported");
    }
  }, []);

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const res = await ensurePushSubscribed();
      if (!res.ok) {
        if (res.reason === "denied") setState("denied");
        else setState("unsubscribed");
        return;
      }
      setState("subscribed");
    } finally {
      setBusy(false);
    }
  }, []);

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

  useEffect(() => {
    (async () => {
      await refresh();
      // Auto-subscribe trên mount nếu permission đã granted nhưng chưa có sub
      // (vd sau enroll đã grant nhưng subscribe fail). Không auto-prompt nếu
      // permission default — cần user gesture trên iOS.
      if (!autoTried.current) {
        autoTried.current = true;
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          subscribe();
        }
      }
    })();
  }, [refresh, subscribe]);

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
