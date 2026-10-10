// Screenshot comparisons of the main screens, in Light and Dark. A change
// that moves, clips or recolours something fails here; when a change is
// meant, update the images on purpose (see e2e/README.md).
//
// The screens use Ayesha, a seeded student nobody else touches, reset to the
// same progress before each screen. The browser clock is fixed at 3 pm
// Pakistan time and animations are off. The only masked parts are the weekly
// study strips, which depend on which weekday the tests run.

import type { Locator, Page } from "@playwright/test";
import { expect, loginAs, recentPktTime, test, THEME_KEY } from "../support/fixtures.ts";
import { ACCOUNTS, BATCH_CODE, HAND_HYGIENE_QUESTIONS, IDS } from "../support/seed-data.ts";
import { screenshotWorld } from "../support/worlds.ts";

test.describe.configure({ mode: "serial" });

// Text renders slightly differently from one machine to the next, so the
// images are only compared in the pinned browser that `npm run test:e2e`
// (and CI) uses.
test.skip(
  !process.env.E2E_BROWSER_WS,
  "Screenshots are compared in the pinned browser: run `npm run test:e2e`.",
);

type Theme = "light" | "dark";

async function snap(page: Page, name: string, mask: Locator[] = []) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, { mask });
}

async function asAyesha(page: Page, theme: Theme) {
  await screenshotWorld();
  await loginAs(page, ACCOUNTS.screenshotStudent, { theme });
}

for (const theme of ["light", "dark"] as const) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setSystemTime(recentPktTime(15));
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    test("welcome", async ({ page }) => {
      await page.addInitScript(
        ([key, value]) => {
          localStorage.setItem(key, value);
          sessionStorage.setItem("florence:splash-seen", "1");
        },
        [THEME_KEY, theme] as const,
      );
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Welcome to Florence." })).toBeVisible();
      await snap(page, `${theme}-welcome`);
    });

    test("join", async ({ page }) => {
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
        THEME_KEY,
        theme,
      ] as const);
      await page.goto(`/signup?code=${BATCH_CODE}`);
      await expect(page.getByText("Code found. Is this you?")).toBeVisible();
      await page.getByLabel("Batch code").blur();
      await snap(page, `${theme}-join`);
    });

    test("today", async ({ page }) => {
      await asAyesha(page, theme);
      await page.goto("/home");
      await expect(page.getByRole("heading", { name: "10 cards" })).toBeVisible();
      await expect(page.getByText("4 days in a row")).toBeVisible();
      await snap(page, `${theme}-today`, [
        page.locator('[aria-hidden="true"]:has(> svg.h-4)'), // this week's flames
      ]);
    });

    test("subjects", async ({ page }) => {
      await asAyesha(page, theme);
      await page.goto("/subjects");
      await expect(page.getByText("Microbiology").first()).toBeVisible();
      await snap(page, `${theme}-subjects`);
    });

    test("chapter notes", async ({ page }) => {
      await asAyesha(page, theme);
      await page.goto(`/chapters/${IDS.vitalSigns}`);
      await expect(page.getByRole("heading", { name: "Why vital signs matter" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Practise this chapter/ })).toContainText(
        "10 cards due",
      );
      await snap(page, `${theme}-chapter-notes`);
    });

    test("flashcard front and answer", async ({ page }) => {
      await asAyesha(page, theme);
      await page.goto("/session");
      await expect(page.getByText("1 of 10")).toBeVisible();
      await snap(page, `${theme}-flashcard-front`);
      await page.getByRole("button", { name: "Show answer" }).last().click();
      await expect(page.getByText("How well did you remember it?")).toBeVisible();
      await snap(page, `${theme}-flashcard-answer`);
    });

    test("session complete", async ({ page }) => {
      await asAyesha(page, theme);
      await page.goto("/session");
      for (let n = 1; n <= 10; n++) {
        await expect(page.getByText(`${n} of 10`)).toBeVisible();
        await page.getByRole("button", { name: "Show answer" }).last().click();
        await page.getByRole("button", { name: /^Good: Got it/ }).click();
      }
      await expect(page.getByText("Session complete · 10 cards")).toBeVisible();
      await expect(page.getByText("5 days in a row")).toBeVisible();
      await snap(page, `${theme}-session-complete`);
    });

    test("quiz feedback", async ({ page }) => {
      await asAyesha(page, theme);
      // The server shuffles the paper; open quizzes until it starts with this one.
      const target = HAND_HYGIENE_QUESTIONS[2];
      for (let attempt = 0; ; attempt++) {
        expect(attempt, "a quiz starting with the target question").toBeLessThan(60);
        await page.goto(`/chapters/${IDS.handHygiene}?tab=quiz`);
        await expect(page.getByText("1 of 5")).toBeVisible();
        if ((await page.getByRole("heading", { level: 2 }).textContent())?.trim() === target.prompt)
          break;
      }
      const wrong = (target.correct + 1) % target.options.length;
      await page
        .getByRole("radiogroup", { name: "Answer options" })
        .getByRole("radio")
        .nth(wrong)
        .click();
      await expect(page.getByText("Not quite.")).toBeVisible();
      await snap(page, `${theme}-quiz-feedback`);
    });

    test("progress", async ({ page }) => {
      await asAyesha(page, theme);
      await page.goto("/progress");
      await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
      await expect(
        page.getByRole("img", { name: /Progress rose: Fundamentals of Nursing/ }),
      ).toBeVisible();
      await snap(page, `${theme}-progress`);
    });

    test("batch", async ({ page }) => {
      await asAyesha(page, theme);
      await page.goto("/batch");
      await expect(page.getByText("BSN Generic · SIHAT · 1 student")).toBeVisible();
      await expect(page.getByText("6 reviews")).toBeVisible();
      await snap(page, `${theme}-batch`, [
        page.locator("section", { hasText: "Your week" }).locator(".grid"),
      ]);
    });

    test("settings", async ({ page }) => {
      await asAyesha(page, theme);
      await page.goto("/profile");
      await expect(page.getByText(ACCOUNTS.screenshotStudent.email)).toBeVisible();
      await expect(page.getByText("BSN 2026 Section B")).toBeVisible();
      await snap(page, `${theme}-settings`);
    });

    test("faculty review", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await loginAs(page, ACCOUNTS.faculty, { theme });
      await page.goto(`/admin/review?chapter=${IDS.woundCare}`);
      await expect(page.getByRole("heading", { name: "Wound care" })).toBeVisible();
      await expect(page.getByText(/AI draft · not yet reviewed/)).toBeVisible();
      await expect(page.getByText("At least 15 approved questions (2)")).toBeVisible();
      await snap(page, `${theme}-faculty-review`, [
        // Counts across every chapter, including ones other tests make.
        page.getByRole("navigation", { name: "Faculty navigation" }).locator(".fl-number"),
      ]);
    });
  });
}
