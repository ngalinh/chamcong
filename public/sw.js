// Service worker — PWA asset cache + Web Push + App Badge.
const VERSION = "v12";
const CACHE_NAME = `cham-cong-${VERSION}`;
const HTML_CACHE = `cham-cong-html-${VERSION}`;
// Models cache tách khỏi VERSION: bump SW không wipe ~7MB models đã tải.
// Chỉ bump MODELS_CACHE khi thực sự thay file face-api weights trong public/models/.
const MODELS_CACHE = "cham-cong-models-v1";
// Next.js static (JS/CSS) — URL có hash content (immutable).
// Cache-first riêng, không bump theo VERSION → asset của build cũ còn nguyên
// để serve nếu HTML cache còn tham chiếu (tránh 404 → UI vỡ sau khi deploy).
const NEXT_STATIC_CACHE = "cham-cong-next-static-v1";
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
    const keep = new Set([CACHE_NAME, HTML_CACHE, MODELS_CACHE, NEXT_STATIC_CACHE, BADGE_CACHE]);
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

  // 1a. Face-api models (~7MB): cache-first vào MODELS_CACHE riêng
  // → survive qua mọi lần bump VERSION (deploy mới không wipe).
  if (url.pathname.startsWith("/models/")) {
    e.respondWith(cacheFirst(req, MODELS_CACHE));
    return;
  }

  // 1b. PWA icons: cache-first theo VERSION (đổi icon thì bump VERSION là OK).
  if (url.pathname.startsWith("/icons/")) {
    e.respondWith(cacheFirst(req, CACHE_NAME));
    return;
  }

  // 1c. Next.js static (JS/CSS bundles): cache-first.
  // URL có content hash → immutable. Cache giữ qua nhiều build → khi HTML
  // cached còn ref hash cũ, vẫn serve được từ cache thay vì 404 → UI vỡ.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(cacheFirst(req, NEXT_STATIC_CACHE));
    return;
  }

  // 2. HTML pages NV-only: stale-while-revalidate
  // → mở PWA: thấy UI cũ ngay (instant), fetch ngầm để update cache.
  // Chỉ apply cho navigation request (page load), không apply cho fetch JSON từ client.
  if (req.mode === "navigate" && shouldCacheHTML(url)) {
    // .catch → nếu SW logic throw, fallback về fetch trực tiếp (tránh iOS Safari "server error")
    e.respondWith(staleWhileRevalidate(e, req, HTML_CACHE).catch(() => fetch(req)));
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

// Lấy "chữ ký" asset của HTML — set các URL /_next/static/* được ref trong page.
// Set này stable theo build, đổi sau mỗi deploy mới. Dùng để phát hiện build
// mới khi revalidate, vì content HTML khác (timestamps, dynamic SSR) không phản
// ánh build change.
function htmlAssetSig(html) {
  const m = html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [];
  return Array.from(new Set(m)).sort().join("|");
}

async function staleWhileRevalidate(e, req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const networkPromise = (async () => {
    try {
      const res = await fetch(req);
      // Chỉ cache 200 OK không redirect (login redirect khi chưa đăng nhập),
      // không cache opaque (cross-origin) hay error.
      // !res.redirected: tránh cache login page dưới key "/" khi middleware redirect
      if (res && res.ok && res.status === 200 && res.type === "basic" && !res.redirected) {
        // Đọc body một lần từ res gốc (KHÔNG clone) để tránh iOS Safari bug:
        // clone().text() đôi khi drain cả original body → return res trả về rỗng → "server error"
        const newText = await res.text();
        let assetChanged = false;
        if (cached) {
          try {
            const oldText = await cached.clone().text();
            assetChanged = htmlAssetSig(oldText) !== htmlAssetSig(newText);
          } catch {}
        }
        const makeRes = () => new Response(newText, { headers: res.headers, status: res.status, statusText: res.statusText });
        await cache.put(req, makeRes()).catch(() => {});
        // Build mới (asset hash đổi) → page đang hiện bị broken vì JS/CSS cũ.
        // Báo client reload để load HTML + asset mới.
        if (assetChanged) {
          const cls = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
          for (const c of cls) {
            try { c.postMessage({ type: "RELOAD_FOR_UPDATE" }); } catch {}
          }
        }
        // Trả về Response mới từ text đã đọc (body chắc chắn còn nguyên)
        return makeRes();
      }
      return res;
    } catch {
      return null;
    }
  })();

  // Nếu có cache → trả ngay, fetch ngầm update cho lần sau.
  if (cached) {
    e.waitUntil(networkPromise);
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
