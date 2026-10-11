import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://florence.example";
const CHAPTER_A = "e2e00005-0000-4000-8000-000000000001";
const CHAPTER_B = "e2e00005-0000-4000-8000-000000000002";

// A small stand-in for the browser's CacheStorage, enough for sw.js.
class FakeCache {
  entries = new Map<string, Response>();
  private url(request: Request | string) {
    return typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
  }
  async match(request: Request | string) {
    return this.entries.get(this.url(request))?.clone();
  }
  async put(request: Request | string, response: Response) {
    this.entries.set(this.url(request), response);
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async delete(request: Request | string) {
    return this.entries.delete(this.url(request));
  }
}

class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name)!;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
}

const html = (body: string) =>
  `<!DOCTYPE html><html><head><link rel="modulepreload" href="/assets/index-abc.js"/><link rel="stylesheet" href="/assets/styles-abc.css"/></head><body>${body}</body></html>`;

type Listener = (event: Record<string, unknown>) => void;

function loadWorker(server: { online: boolean; pages: Record<string, string> }) {
  const listeners: Record<string, Listener[]> = {};
  const caches = new FakeCaches();
  const fetched: string[] = [];
  const fetch = async (input: Request | string) => {
    const url = typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
    fetched.push(url);
    if (!server.online) throw new TypeError("Failed to fetch");
    const path = new URL(url).pathname;
    if (path.startsWith("/assets/")) return new Response("asset", { status: 200 });
    const body = server.pages[path];
    if (body === undefined) return new Response("Not found", { status: 404 });
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    // Responses from fetch() are "basic" for the worker's own origin.
    Object.defineProperty(response, "type", { value: "basic" });
    return response;
  };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, listener: Listener) => {
      (listeners[type] ??= []).push(listener);
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(serviceWorker, {
    self,
    caches,
    fetch,
    URL,
    Request,
    Response,
    Promise,
    Set,
    console,
  });

  async function dispatchFetch(request: Request, mode: string, destination = "") {
    Object.defineProperty(request, "mode", { value: mode });
    Object.defineProperty(request, "destination", { value: destination });
    let responded: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    for (const listener of listeners.fetch ?? []) {
      listener({
        request,
        respondWith: (r: Promise<Response>) => (responded = Promise.resolve(r)),
        waitUntil: (p: Promise<unknown>) => pending.push(p),
      });
    }
    const response = responded ? await responded : undefined;
    await Promise.all(pending);
    return response;
  }

  return {
    caches,
    fetched,
    navigate: (path: string) => dispatchFetch(new Request(new URL(path, ORIGIN)), "navigate"),
    get: (url: string, destination = "") =>
      dispatchFetch(new Request(new URL(url, ORIGIN)), "cors", destination),
    send: (request: Request) => dispatchFetch(request, "cors"),
    async install() {
      const pending: Promise<unknown>[] = [];
      for (const listener of listeners.install ?? [])
        listener({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
      await Promise.all(pending);
    },
    async message(data: unknown) {
      const pending: Promise<unknown>[] = [];
      const replies: unknown[] = [];
      for (const listener of listeners.message ?? []) {
        listener({
          data,
          ports: [{ postMessage: (reply: unknown) => replies.push(reply) }],
          waitUntil: (p: Promise<unknown>) => pending.push(p),
        });
      }
      await Promise.all(pending);
      return replies;
    },
  };
}

describe("service worker privacy", () => {
  it("does not runtime-cache authenticated Supabase API responses", () => {
    expect(serviceWorker).not.toContain("sihat-supabase-get");
    expect(serviceWorker).not.toContain('url.pathname.startsWith("/rest/")');
  });

  it("bumps the cache version so the old caches are removed", () => {
    expect(serviceWorker).toContain('const CACHE_VERSION = "v8"');
  });

  it("loads no code from a CDN, so it installs with no outside network", () => {
    expect(serviceWorker).not.toContain("importScripts");
  });
});

describe("service worker offline behaviour", () => {
  let server: { online: boolean; pages: Record<string, string> };
  beforeEach(() => {
    server = {
      online: true,
      pages: {
        "/home": html("home"),
        [`/chapters/${CHAPTER_A}`]: html("chapter shell A"),
        [`/chapters/${CHAPTER_B}`]: html("chapter shell B"),
        "/subjects": html("subjects"),
      },
    };
  });

  it("keeps /home at install for a cold start with no signal", async () => {
    const worker = loadWorker(server);
    await worker.install();
    server.online = false;
    expect(await (await worker.navigate("/home"))?.text()).toBe(html("home"));
  });

  it("keeps the pages it's asked to, with their scripts and styles", async () => {
    const worker = loadWorker(server);
    const replies = await worker.message({
      type: "florence:cache-pages",
      urls: [`/chapters/${CHAPTER_A}`, "https://elsewhere.example/page"],
    });
    expect(replies).toEqual([{ ok: true }]);
    expect(worker.fetched).not.toContain("https://elsewhere.example/page");

    server.online = false;
    const response = await worker.navigate(`/chapters/${CHAPTER_A}?tab=flashcards`);
    expect(await response?.text()).toBe(html("chapter shell A"));
    const assets = await worker.caches.open("sihat-assets-v8");
    expect(await assets.match(`${ORIGIN}/assets/index-abc.js`)).toBeDefined();
    expect(await assets.match(`${ORIGIN}/assets/styles-abc.css`)).toBeDefined();
  });

  it("serves an app shell for a chapter page it has never seen", async () => {
    const worker = loadWorker(server);
    await worker.navigate(`/chapters/${CHAPTER_A}`);
    server.online = false;
    const response = await worker.navigate(`/chapters/${CHAPTER_B}`);
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe(html("chapter shell A"));
  });

  it("falls back to /home for other app routes, then to a plain offline page", async () => {
    const worker = loadWorker(server);
    await worker.install();
    server.online = false;
    expect(await (await worker.navigate("/batch"))?.text()).toBe(html("home"));

    const empty = loadWorker({ online: false, pages: {} });
    const offline = await empty.navigate("/batch");
    expect(offline?.status).toBe(503);
    expect(await offline?.text()).toContain("You're offline.");
  });

  it("opens cached pages straight away and refreshes them in the background", async () => {
    const worker = loadWorker(server);
    await worker.navigate("/subjects");
    server.pages["/subjects"] = html("subjects, updated");
    expect(await (await worker.navigate("/subjects"))?.text()).toBe(html("subjects"));
    expect(await (await worker.navigate("/subjects"))?.text()).toBe(html("subjects, updated"));
  });

  it("never handles server functions, Supabase or writes", async () => {
    const worker = loadWorker(server);
    expect(await worker.get("/_serverFn/abc?payload=1")).toBeUndefined();
    expect(
      await worker.get("https://project.supabase.co/rest/v1/chapters?select=*", "image"),
    ).toBeUndefined();
    expect(
      await worker.get(
        "https://project.supabase.co/storage/v1/object/sign/diagrams/a.png",
        "image",
      ),
    ).toBeUndefined();
    expect(
      await worker.send(new Request(`${ORIGIN}/assets/a.js`, { method: "POST", body: "{}" })),
    ).toBeUndefined();
    expect(worker.caches.stores.get("sihat-html-v8")?.entries.size ?? 0).toBe(0);
  });

  it("caches the app's scripts first, from the network once", async () => {
    const worker = loadWorker(server);
    await worker.get("/assets/index-abc.js", "script");
    server.online = false;
    const response = await worker.get("/assets/index-abc.js", "script");
    expect(await response?.text()).toBe("asset");
  });
});
