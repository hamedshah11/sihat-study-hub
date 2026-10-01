import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

describe("service worker privacy", () => {
  it("does not runtime-cache authenticated Supabase API responses", () => {
    expect(serviceWorker).not.toContain("sihat-supabase-get");
    expect(serviceWorker).not.toContain('url.pathname.startsWith("/rest/")');
  });

  it("bumps the cache version so existing broad API caches are removed", () => {
    expect(serviceWorker).toContain('const CACHE_VERSION = "v6"');
  });
});
