importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");


const CACHE = "all4u-v8";
const STATIC_ASSETS = [
  "./styles.css",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/all4u-art.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // Always prefer fresh HTML/JS so GitHub Pages updates appear immediately.
  if (
    req.mode === "navigate" ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/index.html")
  ) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE).then(cache => cache.put(req, clone));
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});

