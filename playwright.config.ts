// End-to-end tests for Florence. See e2e/README.md for how to run them.
//
// They run against a LOCAL Supabase stack (`npm run e2e:supabase`) and a
// production build of the app served by wrangler. e2eEnv() refuses any
// Supabase URL that isn't on this machine.

import { defineConfig } from "@playwright/test";
import { e2eEnv } from "./e2e/support/env.ts";
import { STUB_PORT } from "./e2e/stubs/anthropic.ts";

const env = e2eEnv();
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e/tests",
  testMatch: /.*\.e2e\.ts$/,
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}{ext}",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: CI,
  // A retry would hide exactly the flakiness these tests exist to catch.
  retries: 0,
  workers: CI ? 2 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      // Anti-aliasing noise only; a moved or clipped element is far bigger.
      maxDiffPixelRatio: 0.002,
    },
  },
  reporter: CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: env.appUrl,
    // A phone, as most students use: 390 × 844 CSS pixels.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Asia/Karachi",
    // The service worker caches pages between tests; keep every run cold.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // `npm run test:e2e` runs the browser in the official Playwright image
        // (e2e/scripts/run.ts), so screenshots render the same on every
        // machine. Requests to this machine are tunnelled back to it.
        connectOptions: process.env.E2E_BROWSER_WS
          ? { wsEndpoint: process.env.E2E_BROWSER_WS, exposeNetwork: "<loopback>" }
          : undefined,
      },
    },
  ],
  webServer: [
    {
      command: "node e2e/stubs/anthropic.ts",
      url: `http://127.0.0.1:${STUB_PORT}/health`,
      reuseExistingServer: !CI,
      stdout: "pipe",
    },
    {
      command: "node e2e/scripts/serve.ts",
      url: env.appUrl,
      timeout: 300_000,
      reuseExistingServer: !CI,
      stdout: "pipe",
    },
  ],
});
