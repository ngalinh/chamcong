"use client";

import { useEffect } from "react";

/**
 * Xoá badge số đỏ trên icon PWA khi user mở hoặc quay lại app.
 * Dùng cả App Badge API (client) và postMessage cho SW để reset counter.
 */
export function BadgeClearer() {
  useEffect(() => {
    const clear = async () => {
      try {
        if ("clearAppBadge" in navigator) {
          await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
        }
      } catch {}
      try {
        navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_BADGE" });
      } catch {}
    };

    clear();

    const onVis = () => {
      if (document.visibilityState === "visible") clear();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", clear);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", clear);
    };
  }, []);

  return null;
}
