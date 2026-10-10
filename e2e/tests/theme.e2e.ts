import { MICRO_CH1 } from "../fixtures/curriculum.ts";
import { latestPkt } from "../support/time.ts";
import { expect, setTheme, startAs, test } from "../support/test.ts";

// Light = Linen paper; Lamplight mode = the `dark` class on <html>.
const DARK = /(^|\s)dark(\s|$)/;

test("Light, Dark and Automatic each apply from Settings", async ({ page }) => {
  await page.clock.install({ time: latestPkt(10) });
  await startAs(page, "theme");
  await page.goto("/profile");
  const html = page.locator("html");

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveClass(DARK);
  await expect(html).toHaveAttribute("data-theme", "dark");
  // The choice is kept, and painted before the app loads.
  await page.reload();
  await expect(html).toHaveClass(DARK);
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(DARK);
  await expect(html).toHaveAttribute("data-theme", "light");

  // Automatic at 10 am is Linen.
  await page.getByRole("radio", { name: "Automatic" }).click();
  await expect(html).toHaveAttribute("data-theme", "auto");
  await expect(html).not.toHaveClass(DARK);
});

test("Automatic uses Lamplight mode at night", async ({ page }) => {
  await page.clock.install({ time: latestPkt(21) });
  await startAs(page, "theme");
  await setTheme(page, "auto");
  await page.goto("/home");
  await expect(page.locator("html")).toHaveClass(DARK);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "auto");
});

test("Automatic never switches in the middle of a session", async ({ page }) => {
  // 7:58 pm: Linen. Lamplight mode starts at 8 pm.
  await page.clock.install({ time: latestPkt(19, 58) });
  await startAs(page, "theme");
  await setTheme(page, "auto");
  const html = page.locator("html");

  await page.goto(`/chapters/${MICRO_CH1.id}?tab=flashcards`);
  await expect(page.locator(".fl-question")).toBeVisible();
  await expect(html).not.toHaveClass(DARK);

  // Past 8 pm, with the once-a-minute theme check run a few times.
  await page.clock.fastForward("04:00");
  await page.getByRole("button", { name: "Show answer" }).last().click();
  await expect(page.getByText("Answer", { exact: true })).toBeVisible();
  await expect(html).not.toHaveClass(DARK);

  // The switch waited for the session to end.
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("tab", { name: "Notes" })).toBeVisible();
  await expect(html).toHaveClass(DARK);
});
