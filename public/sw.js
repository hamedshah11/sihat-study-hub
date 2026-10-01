/* Sihat service worker — Workbox via CDN.
   Bump CACHE_VERSION on every deploy to invalidate old caches. */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js");

const CACHE_VERSION = "v6";
workbox.core.setCacheNameDetails({ prefix: "sihat", suffix: CACHE_VERSION });

self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("sihat-") && !k.endsWith(`-${CACHE_VERSION}`))
            .map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

const { registerRoute } = workbox.routing;
const { CacheFirst, StaleWhileRevalidate } = workbox.strategies;
const { CacheableResponsePlugin } = workbox.cacheableResponse;
const { ExpirationPlugin } = workbox.expiration;

// HTML navigations — stale-while-revalidate for instant loads on mobile.
// Serves the cached shell immediately, then updates in the background.
registerRoute(
  ({ request }) => request.mode === "navigate",
  new StaleWhileRevalidate({
    cacheName: `sihat-html-${CACHE_VERSION}`,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);

// JS / CSS / Workers — cache first (versioned cache → safe)
registerRoute(
  ({ request }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "worker",
  new CacheFirst({
    cacheName: `sihat-assets-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// Fonts
registerRoute(
  ({ request }) => request.destination === "font",
  new CacheFirst({
    cacheName: `sihat-fonts-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
);

// Icons / images
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: `sihat-images-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// Never cache Supabase REST responses. Workbox keys runtime-cache entries by
// URL, not by the bearer token that RLS used to shape the response. Caching
// authenticated API reads here could therefore show one student's personal
// data to the next account using the same browser. Explicit, account-scoped
// offline curriculum storage will be implemented separately in IndexedDB.

// Never intercept POST/PUT/PATCH/DELETE — let them fail offline naturally.
