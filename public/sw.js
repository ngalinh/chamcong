// Service worker — PWA asset cache + Web Push + App Badge.
const VERSION = "v8";
const CACHE_NAME = `cham-cong-${VERSION}`;
const BADGE_CACHE = "badge-state";
const BADGE_KEY = "/__badge_count";

// ---- App Badge helpers -----------------------------------------
async function getBadgeCount() {
  try {
    const c = await caches.open(BADGE_CACHE);
    const res = await c.match(BADGE_KEY);
    if (!res) return 0;
    return Number(await res.text()) || 0;
  } catch { return 0; }
}
async function setBadgeCount(n) {
  try {
    const c = await caches.open(BADGE_CACHE);
    await c.put(BADGE_KEY, new Response(String(n)));
  } catch {}
  try {
    if (n > 0 && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(n);
    } else if (n <= 0 && "clearAppBadge" in self.navigator) {
      await self.navigator.clearAppBadge();
    }
  } catch {}
}

// ---- SW lifecycle -----------------------------------------------
self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n !== CACHE_NAME && n !== BADGE_CACHE)
        .map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/models/") || url.pathname.startsWith("/icons/")) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok && res.status === 200) cache.put(e.request, res.clone());
        return res;
      } catch {
        return hit ?? Response.error();
      }
    })());
  }
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data?.type === "CLEAR_BADGE") {
    e.waitUntil(setBadgeCount(0));
  }
});

// ---- Web Push + Badge -------------------------------------------
self.addEventListener("push", (e) => {
  let payload = { title: "Chấm công", body: "Bạn có thông báo mới" };
  if (e.data) {
    try { payload = { ...payload, ...e.data.json() }; }
    catch { payload.body = e.data.text(); }
  }
  e.waitUntil((async () => {
    // Luôn show OS notification (banner + tray entry)
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url || "/" },
      requireInteraction: false,
    });

    // Đồng thời gửi vào mọi client đang mở → show in-app toast
    // (cần thiết vì iOS PWA foreground thường suppress OS banner)
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      try { c.postMessage({ type: "PUSH", payload }); } catch {}
    }

    const current = await getBadgeCount();
    await setBadgeCount(current + 1);
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || "/";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      try {
        await c.focus();
        if ("navigate" in c) await c.navigate(targetUrl);
        // Open PWA sẽ auto-clear badge qua BadgeClearer
        return;
      } catch {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
