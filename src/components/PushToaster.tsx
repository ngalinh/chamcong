"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";

type Toast = {
  id: string;
  title: string;
  body: string;
  url?: string;
};

/**
 * Lắng nghe postMessage từ service worker khi có push event,
 * hiển thị toast nổi ở đầu màn hình. Cần thiết vì iOS PWA foreground
 * thường không show OS banner — phải tự render in-app.
 */
export function PushToaster() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "PUSH") return;
      const p = e.data.payload ?? {};
      const toast: Toast = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: p.title ?? "Thông báo",
        body: p.body ?? "",
        url: p.url,
      };
      setToasts((prev) => [...prev, toast]);
      // Tự ẩn sau 7s
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 7000);
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function click(t: Toast) {
    dismiss(t.id);
    if (t.url) router.push(t.url);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 pt-safe px-safe pointer-events-none">
      <div className="max-w-md mx-auto pt-3 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto bg-neutral-900/95 backdrop-blur text-white rounded-2xl p-3 shadow-2xl shadow-black/20 flex items-start gap-3 animate-slide-down"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shrink-0">
              <Bell size={18} className="text-white" />
            </div>
            <button
              onClick={() => click(t)}
              className="flex-1 min-w-0 text-left active:opacity-70"
            >
              <p className="font-semibold text-sm leading-tight">{t.title}</p>
              <p className="text-xs text-white/75 mt-0.5 line-clamp-2">{t.body}</p>
            </button>
            <button
              onClick={() => dismiss(t.id)}
              className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/60 shrink-0"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
