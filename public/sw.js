// Service worker — PWA asset cache + Web Push + App Badge.
const VERSION = "v9";
const CACHE_NAME = `cham-cong-${VERSION}`;
const HTML_CACHE = `cham-cong-html-${VERSION}`;
const BADGE_CACHE = "badge-state";
const BADGE_KEY = "/__badge_count";

// Các path NV-only được cache HTML stale-while-revalidate.
// Khi mở PWA, hiện ngay UI từ cache → fetch ngầm → update cache cho lần sau.
// Không cache /login, /auth/*, /admin/* (admin nhạy cảm + ít user), /api/*.
const HTML_CACHE_PATHS = [
  "/",
  "/checkin",
  "/leave",
  "/overtime",
  "/violations",
  "/history",
  "/enroll",
];

function shouldCacheHTML(url) {
  if (url.origin !== self.location.origin) return false;
  // Chính xác match hoặc prefix match (vd /history?type=leave)
  return HTML_CACHE_PATHS.some(
    (p) => url.pathname === p || url.pathname.startsWith(p + "/") || url.pathname.startsWith(p + "?"),
  );
}

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
    const keep = new Set([CACHE_NAME, HTML_CACHE, BADGE_CACHE]);
    await Promise.all(
      names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1. Static assets: cache-first (models 7MB + icons không đổi)
  if (url.pathname.startsWith("/models/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(cacheFirst(req, CACHE_NAME));
    return;
  }

  // 2. HTML pages NV-only: stale-while-revalidate
  // → mở PWA: thấy UI cũ ngay (instant), fetch ngầm để update cache.
  // Chỉ apply cho navigation request (page load), không apply cho fetch JSON từ client.
  if (req.mode === "navigate" && shouldCacheHTML(url)) {
    e.respondWith(staleWhileRevalidate(req, HTML_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch {
    return hit ?? Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const networkPromise = (async () => {
    try {
      const res = await fetch(req);
      // Chỉ cache 200 OK, không cache redirect (login redirect khi expired)
      // hoặc opaque (cross-origin) hay error.
      if (res && res.ok && res.status === 200 && res.type === "basic") {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      return null;
    }
  })();

  // Nếu có cache → trả ngay, fetch ngầm update cho lần sau.
  if (cached) {
    // Đẩy networkPromise vào event để SW không bị kill sớm.
    return cached;
  }
  // Không cache → đợi network.
  const fresh = await networkPromise;
  return fresh ?? new Response("Offline", { status: 503, statusText: "Service Unavailable" });
}

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
