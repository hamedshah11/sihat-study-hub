// Themes: Automatic (Lamplight from 8 pm to 6 am), Light and Dark all apply,
// and Automatic never switches in the middle of a study session.
//
// Only the browser's clock is moved; it stays behind the real time so the
// session and the due cards (set relative to the real time) still line up.

import type { Page } from "@playwright/test";
import { DAY } from "../support/admin.ts";
import { expect, loginAs, recentPktTime, test } from "../support/fixtures.ts";
import { IDS } from "../support/seed-data.ts";
import { giveDueCards } from "../support/study.ts";

const html = (page: Page) => page.locator("html");

/** Move the browser clock and let the app notice, as it does once a minute. */
async function setTime(page: Page, at: Date) {
  await page.clock.setFixedTime(at);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage")));
}

test("Automatic follows the time of day but waits for a session to end", async ({
  page,
  student,
}) => {
  await giveDueCards(student.id, IDS.vitalSigns, 3, { dueAgo: 2 * DAY });
  const evening = recentPktTime(19, 58);
  await page.clock.setFixedTime(evening);
  await loginAs(page, student, { theme: "auto" });

  await page.goto("/home");
  await expect(html(page)).toHaveAttribute("data-theme", "auto");
  await expect(html(page)).not.toHaveClass(/\bdark\b/);

  await page.getByRole("link", { name: "Start review" }).click();
  await expect(page.getByText("1 of 3")).toBeVisible();

  // 8:02 pm: Lamplight time, but the session is still open.
  await setTime(page, new Date(evening.getTime() + 4 * 60_000));
  await page.getByRole("button", { name: "Show answer" }).last().click();
  await expect(page.getByText("Answer", { exact: true })).toBeVisible();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);

  // Ending the session lets Lamplight mode in.
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(html(page)).toHaveClass(/\bdark\b/);

  // Back to the afternoon: Automatic goes light again.
  await setTime(page, recentPktTime(14));
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
});

test("Light and Dark apply straight away from Settings, whatever the time", async ({
  page,
  student,
}) => {
  await page.clock.setFixedTime(recentPktTime(21));
  await loginAs(page, student, { theme: "auto" });
  await page.goto("/profile");
  const theme = page.getByRole("radiogroup", { name: "Theme" });

  // Automatic at 9 pm is Lamplight.
  await expect(theme.getByRole("radio", { name: "Automatic" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(html(page)).toHaveClass(/\bdark\b/);

  await theme.getByRole("radio", { name: "Light" }).click();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  await expect(html(page)).toHaveAttribute("data-theme", "light");

  // The choice is kept for the next visit, before the app has loaded.
  await page.reload();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);

  await setTime(page, recentPktTime(14));
  await theme.getByRole("radio", { name: "Dark" }).click();
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html(page)).toHaveClass(/\bdark\b/);

  await theme.getByRole("radio", { name: "Automatic" }).click();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
});
