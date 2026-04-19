// Service worker tối giản. Cache-bust khi bump VERSION — user tự động dùng bản mới.
const VERSION = "v3";
const CACHE_NAME = `cham-cong-${VERSION}`;

self.addEventListener("install", (e) => {
  // Active ngay, không đợi tab cũ đóng
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // Xoá tất cả cache cũ (version khác) — giải phóng 404 cache
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Chỉ cache static assets nặng (face-api models + icons) để bật lại offline nhanh.
  // Các request khác → network-first, không cache (để HTML/JS luôn mới nhất).
  if (url.pathname.startsWith("/models/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try {
          const res = await fetch(e.request);
          // CHỈ cache response thành công — KHÔNG cache 404/500/opaque
          if (res.ok && res.status === 200) {
            cache.put(e.request, res.clone());
          }
          return res;
        } catch {
          return hit ?? Response.error();
        }
      })(),
    );
  }
});

// Cho phép client trigger update ngay (dùng cho nút Làm mới nếu có)
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
