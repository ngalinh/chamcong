"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Kiểm tra update ngay + mỗi 60s khi app đang mở (PWA thường mở lâu)
        reg.update().catch(() => {});
        const interval = setInterval(() => reg.update().catch(() => {}), 60_000);
        window.addEventListener("beforeunload", () => clearInterval(interval));

        // Khi có SW mới được install xong, yêu cầu skipWaiting + reload
        reg.addEventListener("updatefound", () => {
          const newSw = reg.installing;
          if (!newSw) return;
          newSw.addEventListener("statechange", () => {
            if (newSw.state === "installed" && navigator.serviceWorker.controller) {
              // Có bản cũ đang chạy → có update mới, kích hoạt ngay
              newSw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {});

    // Khi SW mới trở thành controller → reload page 1 lần để dùng asset mới
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  return null;
}
