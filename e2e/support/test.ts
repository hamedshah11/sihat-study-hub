import { readFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { ACCOUNTS, E2E_PASSWORD, type AccountKey } from "../fixtures/accounts.ts";
import { localSupabase } from "./env.ts";
import { resetStudent } from "./scenarios.ts";
import type { ThemePreference } from "../../src/lib/theme.ts";

// The `test` every spec uses. Each page is sealed off from the internet: only
// this machine is reachable, Google Fonts are served from e2e/fixtures/fonts,
// and any attempt to reach a hosted Supabase project fails the test.

const FONTS_DIR = path.join(import.meta.dirname, "..", "fixtures", "fonts");
const LOCAL = /^(https?|wss?):\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//;

type Fixtures = {
  /** Requests the page tried to make to a hosted Supabase project (should stay empty). */
  remoteSupabaseRequests: string[];
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  remoteSupabaseRequests: async ({}, provide) => {
    await provide([]);
  },
  context: async ({ context }, provide) => {
    await context.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({
        contentType: "text/css",
        body: readFileSync(path.join(FONTS_DIR, "fonts.css")),
      }),
    );
    await context.route("https://fonts.gstatic.com/e2e/*", (route) =>
      route.fulfill({
        contentType: "font/woff2",
        body: readFileSync(
          path.join(FONTS_DIR, path.basename(new URL(route.request().url()).pathname)),
        ),
      }),
    );
    await provide(context);
  },
  page: async ({ page, remoteSupabaseRequests }, provide) => {
    await page.route(
      (url) =>
        !LOCAL.test(url.href) && !url.href.startsWith("data:") && !url.href.startsWith("blob:"),
      async (route) => {
        const url = route.request().url();
        if (
          url.startsWith("https://fonts.googleapis.com/") ||
          url.startsWith("https://fonts.gstatic.com/e2e/")
        ) {
          await route.fallback();
          return;
        }
        if (/\.supabase\.(co|in)\b/.test(url)) remoteSupabaseRequests.push(url);
        await route.abort("blockedbyclient");
      },
    );
    await provide(page);
    expect(remoteSupabaseRequests, "requests to a hosted Supabase project").toEqual([]);
  },
});

export { expect };

/** supabase-js keeps the session in localStorage under sb-<first label of the host>-auth-token. */
function storageKey() {
  return `sb-${new URL(localSupabase().url).hostname.split(".")[0]}-auth-token`;
}

async function openBlankAppPage(page: Page) {
  // A static file on the app's origin, so localStorage can be set before the app runs.
  await page.goto("/manifest.webmanifest");
}

/**
 * Sign in as a seeded account without going through the sign-in screens
 * (they have their own tests): a password session from the local auth server,
 * stored where the app's Supabase client looks for it.
 */
export async function signInAs(page: Page, key: AccountKey) {
  const account = ACCOUNTS[key];
  const { url, anonKey } = localSupabase();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify(
      account.email
        ? { email: account.email, password: E2E_PASSWORD }
        : { phone: account.phone, password: E2E_PASSWORD },
    ),
  });
  if (!res.ok) throw new Error(`Couldn't sign in ${key}: ${res.status} ${await res.text()}`);
  const session = await res.json();
  await openBlankAppPage(page);
  await page.evaluate(
    ([k, value]) => {
      localStorage.setItem(k, value);
      // Seen the one-time introduction already.
      localStorage.setItem("florence:intro-seen", "1");
    },
    [storageKey(), JSON.stringify(session)],
  );
}

/** Choose a theme before the app loads, as Settings would store it. */
export async function setTheme(page: Page, theme: ThemePreference) {
  await openBlankAppPage(page);
  await page.evaluate((t) => localStorage.setItem("florence-theme", t), theme);
}

/** Reset a student, then sign in as them. */
export async function startAs(page: Page, key: AccountKey) {
  await resetStudent(key);
  await signInAs(page, key);
}
