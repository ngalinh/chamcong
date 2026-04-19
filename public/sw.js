// Service worker tối giản — chỉ để app installable. Không cache API để tránh stale.
const VERSION = "v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  // Chỉ cache tĩnh /models/* (face-api weights) + /icons/* để offline load nhanh
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/models/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(e.request).then(
          (hit) =>
            hit ??
            fetch(e.request).then((res) => {
              cache.put(e.request, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});
