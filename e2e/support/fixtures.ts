// Shared Playwright fixtures for the Florence end-to-end tests.
//
// Every browser context gets a network guard: requests to this machine pass
// through, the app's Google Fonts are served from e2e/fixtures/fonts (so
// screenshots don't depend on the network), and anything else is blocked. A
// request to a hosted Supabase project fails the test outright.

import { readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { createStudent, deleteUser, signIn, type TestUser } from "./admin.ts";
import { e2eEnv } from "./env.ts";

const FONTS_DIR = join(import.meta.dirname, "..", "fixtures", "fonts");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** supabase-js keeps the session under sb-<first part of the host>-auth-token. */
export function authStorageKey() {
  return `sb-${new URL(e2eEnv().supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

export const INTRO_SEEN_KEY = "florence:intro-seen";
export const THEME_KEY = "florence-theme";

async function guardNetwork(context: BrowserContext, blocked: string[]) {
  await context.route(
    (url) => !LOOPBACK.has(url.hostname),
    async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "fonts.googleapis.com") {
        return route.fulfill({
          contentType: "text/css",
          body: readFileSync(join(FONTS_DIR, "fonts.css"), "utf8"),
        });
      }
      if (url.hostname === "fonts.gstatic.com") {
        const file = join(FONTS_DIR, basename(url.pathname));
        if (existsSync(file)) {
          return route.fulfill({ contentType: "font/woff2", body: readFileSync(file) });
        }
      }
      blocked.push(url.href);
      return route.abort("blockedbyclient");
    },
  );
}

type Fixtures = {
  /** Outside requests the page tried to make (all blocked). */
  blockedRequests: string[];
  /** A fresh student for this test, deleted afterwards. */
  student: TestUser;
};

export const test = base.extend<Fixtures>({
  blockedRequests: async ({}, use) => {
    await use([]);
  },
  context: async ({ context, blockedRequests }, use) => {
    await guardNetwork(context, blockedRequests);
    await use(context);
    const hosted = blockedRequests.filter((u) => /supabase\.co|xiuofoymjrashpxvuose/i.test(u));
    expect(hosted, "The app tried to reach a hosted Supabase project").toEqual([]);
  },
  student: async ({}, use) => {
    const user = await createStudent();
    await use(user);
    await deleteUser(user.id);
  },
});

export { expect };

/**
 * Sign the page in as a user without going through the sign-in screens: get
 * a session from the local auth server and put it where supabase-js looks.
 */
export async function loginAs(
  page: Page,
  user: { email: string; password?: string },
  options: { introSeen?: boolean; theme?: "light" | "dark" | "auto" } = {},
) {
  const { session } = await signIn(user.email, user.password);
  // Any same-origin page that doesn't run the app will do.
  await page.goto("/manifest.webmanifest");
  await page.evaluate(
    ([key, value, introSeen, introKey, theme, themeKey]) => {
      localStorage.setItem(key, value);
      if (introSeen) localStorage.setItem(introKey, "1");
      if (theme) localStorage.setItem(themeKey, theme);
    },
    [
      authStorageKey(),
      JSON.stringify(session),
      options.introSeen ?? true,
      INTRO_SEEN_KEY,
      options.theme ?? "",
      THEME_KEY,
    ] as const,
  );
  return session;
}

/** The newest 6-digit code Mailpit has received for an address. */
export async function emailCode(address: string, after = 0): Promise<string> {
  const { mailUrl } = e2eEnv();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    );
    const { messages = [] } = (await res.json()) as {
      messages?: { ID: string; Created: string }[];
    };
    const fresh = messages
      .filter((m) => Date.parse(m.Created) >= after)
      .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created));
    if (fresh[0]) {
      const message = (await (await fetch(`${mailUrl}/api/v1/message/${fresh[0].ID}`)).json()) as {
        Text: string;
      };
      const code = message.Text.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`[e2e] No sign-in code arrived for ${address}`);
}

/**
 * A fixed moment for the browser clock: the most recent `hour`:00 in Pakistan
 * that is safely in the past. The server keeps the real time, so the browser
 * is never ahead of it (sessions would look expired) and seeded data, which
 * is relative to the real time, still lines up.
 */
export function recentPktTime(hour: number, minute = 0) {
  const now = Date.now() - 10 * 60_000;
  const pkt = new Date(now + 5 * 3_600_000);
  let candidate = Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate(), hour, minute);
  candidate -= 5 * 3_600_000;
  if (candidate > now) candidate -= 24 * 3_600_000;
  return new Date(candidate);
}
