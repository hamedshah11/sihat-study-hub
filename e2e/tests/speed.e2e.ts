import type { Page } from "@playwright/test";
import { ACCOUNTS, E2E_PASSWORD } from "../fixtures/accounts.ts";
import { adminClient, studentClient } from "../support/admin.ts";
import { expect, signInAs, startAs, test } from "../support/test.ts";

// Speed measurement: every server function reports its time and its Supabase
// requests in a Server-Timing header, the hot paths keep their Supabase waits
// low, staff can read the last day's timings, and nobody else can.

type Timing = { fn: string; calls: number; waits: number };

/** Server-Timing headers of the server functions this page calls from now on. */
function collectTimings(page: Page): Timing[] {
  const timings: Timing[] = [];
  page.on("response", async (res) => {
    if (!new URL(res.url()).pathname.startsWith("/_serverFn/")) return;
    const header = (await res.allHeaders())["server-timing"] ?? "";
    const m = header.match(
      /fn;desc="([^"]+)";dur=[\d.]+, supabase;desc="(\d+) calls, (\d+) waits"/,
    );
    if (m) timings.push({ fn: m[1], calls: Number(m[2]), waits: Number(m[3]) });
  });
  return timings;
}

function fewestWaits(timings: Timing[], fn: string) {
  const mine = timings.filter((t) => t.fn === fn);
  expect(mine.length, `${fn} was called`).toBeGreaterThan(0);
  return Math.min(...mine.map((t) => t.waits));
}

test("server functions report their time and keep Supabase waits low", async ({ page }) => {
  await startAs(page, "shots");
  const timings = collectTimings(page);
  await page.goto("/home");
  await expect(page.getByText("6 days in a row")).toBeVisible();
  await page.goto("/batch");
  await expect(page.getByText("This week, together")).toBeVisible();
  await page.goto("/session");
  await expect(page.getByText("1 of 10")).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).last().click();
  await page.getByRole("button", { name: /^Good: Got it/ }).click();
  await expect(page.getByText("2 of 10")).toBeVisible();
  await expect.poll(() => timings.some((t) => t.fn === "recordReview")).toBe(true);

  // Reads that don't depend on each other run together. The first request
  // may also wait once for the sign-in keys, so this allows one more.
  expect(fewestWaits(timings, "getProgressSnapshot")).toBeLessThanOrEqual(3);
  expect(fewestWaits(timings, "getBatchOverview")).toBeLessThanOrEqual(3);
  expect(fewestWaits(timings, "recordReview")).toBeLessThanOrEqual(3);
});

test("the speed page shows this tab's requests", async ({ page }) => {
  await startAs(page, "shots");
  await page.goto("/home");
  await expect(page.getByText("6 days in a row")).toBeVisible();
  // Typed into the address bar: a fresh page load, which keeps the tab's timings.
  await page.goto("/speed");
  await expect(page.getByText("getProgressSnapshot")).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(/^Nothing yet/)).toBeVisible();
});

test("staff see the last day's server timings", async ({ page }) => {
  await signInAs(page, "faculty");
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await page.goto("/admin/diagnostics");
  const server = page.locator("section").filter({ hasText: "Server, last 24 hours" });
  // Each timing is saved just after its response is sent.
  await expect(async () => {
    await server.getByRole("button", { name: "Refresh" }).click();
    await expect(server.getByText("getProgressSnapshot")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(server.getByText("Typical").first()).toBeVisible();
});

test("students can't read or write server timings", async () => {
  const account = ACCOUNTS.securityA;
  const student = await studentClient(account.email!, E2E_PASSWORD);

  const read = await student.from("server_timings").select("*").limit(1);
  expect(read.error?.message ?? "").toMatch(/permission denied/i);

  const write = await student
    .from("server_timings")
    .insert({ fn: "forged", duration_ms: 1, supabase_calls: 0, supabase_waits: 0, ok: true });
  expect(write.error?.message ?? "").toMatch(/permission denied/i);

  const summary = await student.rpc("server_timing_summary", {
    p_since: new Date(0).toISOString(),
  });
  expect(summary.error).not.toBeNull();

  // The table holds function names and numbers only.
  const { data: columns } = await adminClient().from("server_timings").select("*").limit(1);
  for (const row of (columns ?? []) as Record<string, unknown>[]) {
    expect(Object.keys(row).sort()).toEqual(
      ["created_at", "duration_ms", "fn", "id", "ok", "supabase_calls", "supabase_waits"].sort(),
    );
  }
});
