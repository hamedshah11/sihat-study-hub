/* Florence service worker. Plain Cache API, no libraries, so it installs even
   when a CDN is out of reach. Bump CACHE_VERSION on every deploy to drop the
   old caches.

   What it keeps:
   - Pages (HTML): stale-while-revalidate, keyed by path. The server renders
     the same signed-out shell for every account ("Loading…" until the app
     reads the session on the phone), so a cached page holds no personal data.
   - Scripts, styles, fonts and the app's own images: cache first (the file
     names carry a content hash).
   - An app shell for pages it hasn't seen: with no signal, a chapter it never
     cached opens from another cached chapter page (same route, same shell),
     or from /home, and the app then reads the chapter from IndexedDB.

   What it never touches:
   - Supabase (REST, storage, auth, edge functions): only same-origin requests
     and Google Fonts are handled. Runtime-cache entries are keyed by URL, not
     by the bearer token RLS used, so caching authenticated API reads here
     could show one student's data to the next account on a shared phone.
     Offline curriculum lives in IndexedDB, keyed by user id
     (src/lib/offline-store.ts).
   - Server functions (/_serverFn/...): their GET responses are personal.
   - POST/PUT/PATCH/DELETE: they fail offline; there is no offline write queue. */

const CACHE_VERSION = "v9";
const PAGES = `sihat-html-${CACHE_VERSION}`;
const ASSETS = `sihat-assets-${CACHE_VERSION}`;
const FONTS = `sihat-fonts-${CACHE_VERSION}`;
const IMAGES = `sihat-images-${CACHE_VERSION}`;
const LIMITS = { [PAGES]: 300, [ASSETS]: 400, [FONTS]: 30, [IMAGES]: 100 };

/** Kept at install, so a cold start with no signal has something to open. */
const SHELL_PAGES = ["/home"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Best effort: a failed precache must not stop the worker installing.
  event.waitUntil(cachePages(SHELL_PAGES).catch(() => {}));
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
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate") {
    if (sameOrigin) event.respondWith(page(event, url));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, FONTS));
    return;
  }
  // Everything else off this origin (Supabase above all) goes straight to the network.
  if (!sameOrigin || url.pathname.startsWith("/_serverFn")) return;

  const destination = request.destination;
  if (destination === "script" || destination === "style" || destination === "worker") {
    event.respondWith(cacheFirst(request, ASSETS));
  } else if (destination === "font") {
    event.respondWith(cacheFirst(request, FONTS));
  } else if (destination === "image" || destination === "manifest") {
    event.respondWith(cacheFirst(request, IMAGES));
  }
});

// The app asks for the pages that show a student's downloads to be kept.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "florence:cache-pages" || !Array.isArray(data.urls)) return;
  const reply = (ok) => event.ports[0]?.postMessage({ ok });
  event.waitUntil(
    cachePages(data.urls, { skipCached: true }).then(
      () => reply(true),
      () => reply(false),
    ),
  );
});

/** Pages are keyed by path: ?tab=quiz and the bare chapter are the same shell. */
function pageKey(url) {
  return new URL(url.pathname, self.location.origin).href;
}

/** /chapters/<id> → /chapters/:id, so any chapter page can stand in for another. */
function routeShape(pathname) {
  return pathname
    .split("/")
    .map((segment) => (UUID.test(segment) ? ":id" : segment))
    .join("/");
}

function isPage(response) {
  return (
    response &&
    response.ok &&
    response.type === "basic" &&
    (response.headers.get("content-type") || "").includes("text/html")
  );
}

async function page(event, url) {
  const cache = await caches.open(PAGES);
  const key = pageKey(url);
  const cached = await cache.match(key);
  const network = fetch(event.request).then(async (response) => {
    if (isPage(response)) {
      await cache.put(key, response.clone());
      await trim(PAGES);
    }
    return response;
  });

  if (cached) {
    // Stale-while-revalidate: open straight away, refresh in the background.
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  try {
    return await network;
  } catch (error) {
    return (await shellFor(cache, url)) || offlinePage();
  }
}

/** A cached page that renders the same shell as one we haven't seen. */
async function shellFor(cache, url) {
  const shape = routeShape(url.pathname);
  const keys = await cache.keys();
  const sameRoute = keys.find((request) => routeShape(new URL(request.url).pathname) === shape);
  if (sameRoute) return cache.match(sameRoute);
  for (const path of SHELL_PAGES) {
    const shell = await cache.match(pageKey(new URL(path, self.location.origin)));
    if (shell) return shell;
  }
  return null;
}

function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · Florence</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141B2D;color:#FBF6EC;font:16px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#C9C3B6;max-width:320px}</style>
</head><body><main><h1>You're offline.</h1><p>This page hasn't been opened on this phone yet. Open Florence again when you're back online.</p></main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Opaque (status 0) responses are cross-origin font files and stylesheets.
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
    await trim(cacheName);
  }
  return response;
}

/** Same-origin pages, plus every script and stylesheet each page loads. */
async function cachePages(urls, { skipCached = false } = {}) {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const url = new URL(raw, self.location.origin);
    if (url.origin !== self.location.origin || url.pathname.startsWith("/_serverFn")) continue;
    const key = pageKey(url);
    if (skipCached && (await pages.match(key))) continue;
    const response = await fetch(url.href, { credentials: "same-origin" });
    if (!isPage(response)) continue;
    const html = await response.clone().text();
    await pages.put(key, response);
    for (const asset of assetUrls(html)) {
      if (!(await assets.match(asset))) {
        const file = await fetch(asset);
        if (file.ok) await assets.put(asset, file);
      }
    }
  }
  await trim(PAGES);
  await trim(ASSETS);
}

/** /assets/... scripts and stylesheets named in a page (src, href and module preloads). */
function assetUrls(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)) {
    found.add(new URL(match[1], self.location.origin).href);
  }
  return [...found];
}

/** Keep each cache under its limit, oldest entries first. */
async function trim(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const extra = keys.length - (LIMITS[cacheName] || 100);
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}
