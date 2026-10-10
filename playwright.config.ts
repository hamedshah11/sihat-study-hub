import { defineConfig } from "@playwright/test";
import { ANTHROPIC_STUB_PORT, APP_PORT, APP_URL, localSupabase } from "./e2e/support/env.ts";

// End-to-end tests: the production build, served locally by the Workers
// runtime, against the LOCAL Supabase stack (`npm run e2e:supabase`). See
// e2e/README.md for how to run them and how to update screenshots.

const CI = Boolean(process.env.CI);
// Reads the local URL and keys from `supabase status`; refuses anything remote.
const supabase = localSupabase();

export default defineConfig({
  testDir: "./e2e/tests",
  // *.e2e.ts, so Vitest (which picks up *.test.ts and *.spec.ts) leaves them alone.
  testMatch: /.*\.e2e\.ts$/,
  // One shared database: run one test at a time. Each test resets its own student.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // Small anti-aliasing differences between machines; a moved or missing
      // element is far more than this.
      maxDiffPixelRatio: 0.005,
    },
  },
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  reporter: CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: APP_URL,
    // Phone first: the size of a typical Android phone.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Asia/Karachi",
    colorScheme: "light",
    reducedMotion: "reduce",
    // The app's service worker caches pages; tests always want the server.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/scripts/anthropic-stub.mjs",
      url: `http://127.0.0.1:${ANTHROPIC_STUB_PORT}/health`,
      reuseExistingServer: !CI,
      env: { E2E_ANTHROPIC_STUB_PORT: String(ANTHROPIC_STUB_PORT) },
    },
    {
      // Builds against the local stack, then serves with `wrangler dev`.
      command: "node e2e/scripts/serve.mjs",
      url: APP_URL,
      timeout: 300_000,
      reuseExistingServer: !CI,
      // E2E_SERVER_LOGS=1 shows the Worker's request log.
      stdout: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
      env: {
        E2E_APP_PORT: String(APP_PORT),
        E2E_SUPABASE_URL: supabase.url,
        E2E_SUPABASE_ANON_KEY: supabase.anonKey,
        E2E_SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
      },
    },
  ],
});
