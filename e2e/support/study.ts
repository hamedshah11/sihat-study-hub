import type { Page } from "@playwright/test";
import { findQuestion } from "../fixtures/curriculum.ts";
import { expect } from "./test.ts";

// Steps shared by the quiz, mistakes and screenshot tests.

/** The answer options of the question on screen (quiz and "Fix your mistakes"). */
export function options(page: Page) {
  return page.getByRole("radio");
}

/** The seeded question currently on screen, so a test can choose right or wrong on purpose. */
export async function questionOnScreen(page: Page) {
  const prompt = await page.locator("h2.fl-question").innerText();
  return findQuestion(prompt).question;
}

/**
 * Tap one option of the question on screen and wait for its feedback.
 * Returns whether the tapped option was right.
 */
export async function answer(page: Page, { right }: { right: boolean }) {
  const question = await questionOnScreen(page);
  const pick = right ? question.correct : (question.correct + 1) % question.options.length;
  await options(page).nth(pick).click();
  await expect(page.getByText(right ? "That's right." : "Not quite.")).toBeVisible();
  return { question, pick };
}

/** Answer every remaining question, then open the results. */
export async function finishQuiz(page: Page, { right }: { right: boolean }) {
  for (;;) {
    if (!(await page.getByText("Not quite.").or(page.getByText("That's right.")).isVisible())) {
      await answer(page, { right });
    }
    const next = page.getByRole("button", { name: /^(Next question|See results)$/ });
    const label = await next.innerText();
    await next.click();
    if (label === "See results") break;
  }
  await expect(page.getByText("Quiz complete")).toBeVisible();
}
