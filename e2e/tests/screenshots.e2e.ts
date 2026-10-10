import type { Locator, Page } from "@playwright/test";
import { BATCH_CODE, MICRO_CH1, MICRO_CH2, VITALS_DRAFT } from "../fixtures/curriculum.ts";
import { resetDraftChapter } from "../support/scenarios.ts";
import { answer } from "../support/study.ts";
import { latestPkt } from "../support/time.ts";
import { expect, setTheme, signInAs, startAs, test } from "../support/test.ts";

// Screenshot comparisons of the main screens, in Light and Dark. The browser
// clock starts at 10 am (Pakistan time), animations are off, fonts are served
// locally, and anything that depends on the weekday or on other tests' data is
// masked. To update the images on purpose: `npm run test:e2e:update`.

const THEMES = ["light", "dark"] as const;

/** Wait until the page has settled: data loaded, fonts in, nothing still fading in. */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
}

async function snap(
  page: Page,
  name: string,
  options: { mask?: Locator[]; fullPage?: boolean } = {},
) {
  await settled(page);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, ...options });
}

/**
 * The server picks quiz questions at random. For a stable picture, put the
 * paper's questions in id order on the way to the browser; nothing else changes.
 */
async function sortQuizPaper(page: Page) {
  await page.route("**/_serverFn/**", async (route) => {
    const response = await route.fetch();
    const text = await response.text();
    if (!text.includes('"quizId"')) {
      await route.fulfill({ response, body: text, headers: plainHeaders(response.headers()) });
      return;
    }
    const json = JSON.parse(text);
    sortQuestions(json);
    await route.fulfill({
      response,
      body: JSON.stringify(json),
      headers: plainHeaders(response.headers()),
    });
  });
}

/** route.fetch() has already decoded the body, so drop the encoding headers. */
function plainHeaders(headers: Record<string, string>) {
  const out = { ...headers };
  delete out["content-encoding"];
  delete out["content-length"];
  delete out["transfer-encoding"];
  return out;
}

type Node = { p?: { k: string[]; v: Node[] }; a?: Node[]; s?: unknown };
function sortQuestions(node: Node) {
  if (!node || typeof node !== "object") return;
  const keys = node.p?.k;
  if (keys?.includes("quizId") && keys.includes("questions")) {
    const list = node.p!.v[keys.indexOf("questions")];
    list.a?.sort((x, y) => String(x.p!.v[0].s).localeCompare(String(y.p!.v[0].s)));
    return;
  }
  for (const child of [...(node.p?.v ?? []), ...(node.a ?? [])]) sortQuestions(child);
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // 10 am, then running: the session-complete screen waits for data newer
      // than the session's end, which a frozen clock would never produce.
      await page.clock.install({ time: latestPkt(10) });
      await setTheme(page, theme);
    });

    test(`welcome (${theme})`, async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("BSN study for Semester 1")).toBeHidden();
      await expect(page.getByRole("link", { name: "I have a batch code" })).toBeVisible();
      await snap(page, `welcome-${theme}`);
    });

    test(`join (${theme})`, async ({ page }) => {
      await page.goto("/signup");
      await page.getByLabel("Batch code").fill(BATCH_CODE);
      await expect(page.getByText("Code found. Is this you?")).toBeVisible();
      await page.getByLabel("Batch code").blur();
      await snap(page, `join-${theme}`);
    });

    test.describe("signed in", () => {
      test.beforeEach(async ({ page }) => {
        await startAs(page, "shots");
        await setTheme(page, theme);
      });

      test(`today (${theme})`, async ({ page }) => {
        await page.goto("/home");
        await expect(page.getByRole("heading", { name: "Good morning, Ayesha." })).toBeVisible();
        await expect(page.getByText("6 days in a row")).toBeVisible();
        // The week's flames follow the real weekday.
        const flames = page.locator("div:has(> svg.h-4.w-3)");
        await snap(page, `today-${theme}`, { mask: [flames] });
      });

      test(`subjects (${theme})`, async ({ page }) => {
        await page.goto("/subjects");
        await expect(page.getByText("Anatomy and Physiology I")).toBeVisible();
        await snap(page, `subjects-${theme}`);
      });

      test(`chapter notes (${theme})`, async ({ page }) => {
        await page.goto(`/chapters/${MICRO_CH1.id}`);
        await expect(
          page.getByRole("heading", { name: "Personal protective equipment" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: /^Practise this chapter · \d+ cards due$/ }),
        ).toBeVisible();
        await snap(page, `chapter-notes-${theme}`, { fullPage: false });
      });

      test(`flashcard front and answer (${theme})`, async ({ page }) => {
        await page.goto("/session");
        await expect(page.getByText("1 of 10")).toBeVisible();
        await snap(page, `flashcard-front-${theme}`);
        await page.getByRole("button", { name: "Show answer" }).last().click();
        await expect(page.getByText("How well did you remember it?")).toBeVisible();
        await snap(page, `flashcard-answer-${theme}`);
      });

      test(`quiz feedback (${theme})`, async ({ page }) => {
        await sortQuizPaper(page);
        await page.goto(`/chapters/${MICRO_CH2.id}?tab=quiz`);
        await expect(page.getByText("1 of 5")).toBeVisible();
        await answer(page, { right: false });
        await expect(page.getByText("Your answer")).toBeVisible();
        await snap(page, `quiz-feedback-${theme}`);
      });

      test(`session complete (${theme})`, async ({ page }) => {
        await page.goto("/session");
        for (let i = 1; i <= 10; i++) {
          await expect(page.getByText(`${i} of 10`)).toBeVisible();
          await page.getByRole("button", { name: "Show answer" }).last().click();
          await page.getByRole("button", { name: /^Good: Got it/ }).click();
        }
        await expect(page.getByText("Session complete · 10 cards")).toBeVisible();
        await expect(
          page.getByRole("heading", { name: /petal (grew|held steady)\.$/ }),
        ).toBeVisible();
        // She had already studied today, so the count stays the same.
        await expect(page.getByText("6 days in a row")).toBeVisible();
        await snap(page, `session-complete-${theme}`);
      });

      test(`progress (${theme})`, async ({ page }) => {
        await page.goto("/progress");
        await expect(page.getByRole("link", { name: /^Microbiology, \d+%$/ })).toBeVisible();
        await snap(page, `progress-${theme}`);
      });

      test(`batch (${theme})`, async ({ page }) => {
        await page.goto("/batch");
        await expect(page.getByText("This week, together")).toBeVisible();
        // Class-wide totals change as other tests study, and the week follows the real weekday.
        await snap(page, `batch-${theme}`, {
          mask: [
            page.locator("header p"),
            page.locator("section", { hasText: "This week, together" }).locator("p").nth(1),
            page.locator("section", { hasText: "This week, together" }).locator("p").nth(2),
            page.locator("section", { hasText: "Your week" }).locator(".grid"),
          ],
        });
      });

      test(`settings (${theme})`, async ({ page }) => {
        await page.goto("/profile");
        await expect(page.getByText("SIHAT BSN 2026")).toBeVisible();
        await snap(page, `settings-${theme}`);
      });
    });

    test.describe("faculty", () => {
      test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

      test(`faculty review (${theme})`, async ({ page }) => {
        await resetDraftChapter();
        await signInAs(page, "faculty");
        await setTheme(page, theme);
        await page.goto(`/admin/review?chapter=${VITALS_DRAFT.id}`);
        await expect(page.getByText("Question 14 · AI draft · not yet reviewed")).toBeVisible();
        await expect(page.getByText("At least 15 approved questions (13)")).toBeVisible();
        await snap(page, `faculty-review-${theme}`);
      });
    });
  });
}
