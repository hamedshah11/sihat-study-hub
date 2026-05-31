/* Sihat service worker — Workbox via CDN.
   Bump CACHE_VERSION on every deploy to invalidate old caches. */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js");

const CACHE_VERSION = "v1";
workbox.core.setCacheNameDetails({ prefix: "sihat", suffix: CACHE_VERSION });

self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("sihat-") && !k.endsWith(`-${CACHE_VERSION}`))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

const { registerRoute, setCatchHandler } = workbox.routing;
const { CacheFirst, NetworkFirst, StaleWhileRevalidate } = workbox.strategies;
const { CacheableResponsePlugin } = workbox.cacheableResponse;
const { ExpirationPlugin } = workbox.expiration;

// HTML navigations — network first, fall back to cache
registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: `sihat-html-${CACHE_VERSION}`,
    networkTimeoutSeconds: 3,
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

// Supabase REST GETs — stale-while-revalidate so previously-opened chapters,
// notes and approved flashcards keep working offline. Skip auth + non-GET.
registerRoute(
  ({ url, request }) => {
    if (request.method !== "GET") return false;
    if (!url.hostname.endsWith(".supabase.co")) return false;
    if (url.pathname.startsWith("/auth/")) return false;
    if (url.pathname.startsWith("/functions/")) return false;
    return url.pathname.startsWith("/rest/") || url.pathname.startsWith("/storage/");
  },
  new StaleWhileRevalidate({
    cacheName: `sihat-supabase-get-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// Never intercept POST/PUT/PATCH/DELETE — let them fail offline naturally.
