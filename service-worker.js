// Minimal service worker for the slot kanshi calendar.
// Only caches local assets; remote fonts and the Sheets sync endpoint bypass cache.
const CACHE_NAME = "slot-kanshi-v20260611a";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./app.js?v=20260611a",
  "./styles.css?v=20260611a",
  "./kanshi-data.js?v=20260611a",
  "./calendar-kicho-label.js?v=20260416a",
  "./manifest.webmanifest"
];

function cacheFreshResponse(request, response) {
  if (response && response.status === 200) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => undefined);
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never cache the Google Apps Script sync endpoint or Google Fonts.
  if (url.hostname.includes("script.google.com") || url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com")) {
    return;
  }

  // Network-first for HTML navigations so fresh app updates are picked up.
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // JS/CSS must be network-first so deployed fixes are not hidden behind old caches.
  if (
    url.origin === self.location.origin &&
    (request.destination === "script" ||
      request.destination === "style" ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css"))
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => cacheFreshResponse(request, response))
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for other same-origin static assets.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => cacheFreshResponse(request, response))
          .catch(() => cached);
      })
    );
  }
});
