/**
 * Tyler Trips — Service Worker
 *
 * Strategy:
 *   - App shell (HTML/CSS/JS/icons): cache-first, served instantly even offline.
 *   - Firebase API calls: pass through (Firestore handles its own offline cache).
 *   - Cache version bump (CACHE_NAME) on every deploy to invalidate stale assets.
 */

const CACHE_NAME = "tyler-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/expenses.js",
  "./js/tally.js",
  "./js/camera.js",
  "./js/tags.js",
  "./js/sync.js",
  "./js/firebase-config.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails the whole install if any file 404s; use individual adds with catch
      Promise.all(
        SHELL.map((url) =>
          cache
            .add(url)
            .catch((err) => console.warn("[sw] skip cache:", url, err.message)),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GETs. Firebase, Storage, Alpine CDN go straight to network.
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match("./index.html")); // navigation fallback
    }),
  );
});
