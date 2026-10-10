// Chapter quiz with instant feedback, graded on the server, and the missed
// question coming back in "Fix your mistakes" the next day.

import type { Page } from "@playwright/test";
import { admin } from "../support/admin.ts";
import { expect, loginAs, test } from "../support/fixtures.ts";
import { HAND_HYGIENE_QUESTIONS, IDS, questionId } from "../support/seed-data.ts";
import { ageAnswers } from "../support/study.ts";

function seededQuestion(prompt: string) {
  const index = HAND_HYGIENE_QUESTIONS.findIndex((q) => q.prompt === prompt);
  expect(index, `"${prompt}" is a seeded Hand hygiene question`).toBeGreaterThanOrEqual(0);
  return { ...HAND_HYGIENE_QUESTIONS[index], id: questionId(IDS.handHygiene, index) };
}

const options = (page: Page) => page.getByRole("radiogroup", { name: "Answer options" });

/** Answers the five-question Hand hygiene quiz, missing the first question on purpose. */
async function takeQuizMissingFirst(page: Page) {
  let missed: ReturnType<typeof seededQuestion> | null = null;
  for (let n = 1; n <= 5; n++) {
    await expect(page.getByText(`${n} of 5`)).toBeVisible();
    const prompt = (await page.getByRole("heading", { level: 2 }).textContent())!.trim();
    const question = seededQuestion(prompt);
    const pick = n === 1 ? (question.correct + 1) % question.options.length : question.correct;
    if (n === 1) missed = question;

    // One tap: no separate "check" step.
    await options(page).getByRole("radio").nth(pick).click();
    if (n === 1) {
      await expect(options(page).getByRole("radio", { name: /Your answer/ })).toContainText(
        question.options[pick],
      );
      await expect(options(page).getByRole("radio", { name: /Correct answer/ })).toContainText(
        question.options[question.correct],
      );
      await expect(page.getByText("Not quite.")).toBeVisible();
      await expect(page.getByText(question.explanation)).toBeVisible();
    } else {
      await expect(page.getByText("That's right.")).toBeVisible();
      await expect(options(page).getByRole("radio", { name: /Correct answer/ })).toBeVisible();
    }
    await page.getByRole("button", { name: n === 5 ? "See results" : "Next question" }).click();
  }
  return missed!;
}

test("a quiz answer gets feedback straight away and the score comes from the server", async ({
  page,
  student,
}) => {
  await loginAs(page, student);
  await page.goto(`/chapters/${IDS.handHygiene}`);
  await page.getByRole("tab", { name: "Quiz" }).click();

  const missed = await takeQuizMissingFirst(page);

  await expect(page.getByText("Quiz complete")).toBeVisible();
  await expect(page.getByRole("heading", { name: "4 out of 5" })).toBeVisible();
  await expect(page.getByText("The one you missed")).toBeVisible();
  await expect(page.getByText(missed.prompt)).toBeVisible();

  // The result on screen is the one the server graded and stored.
  const { data: attempts } = await admin()
    .from("quiz_attempts")
    .select("chapter_id, score, total_questions, answers")
    .eq("user_id", student.id);
  expect(attempts).toHaveLength(1);
  expect(attempts![0]).toMatchObject({
    chapter_id: IDS.handHygiene,
    score: 4,
    total_questions: 5,
  });
  const graded = attempts![0].answers as { questionId: string; correct: boolean }[];
  expect(graded.filter((a) => !a.correct).map((a) => a.questionId)).toEqual([missed.id]);

  const { data: progress } = await admin()
    .from("chapter_progress")
    .select("mastery_score, attempts")
    .eq("user_id", student.id)
    .single();
  expect(progress).toMatchObject({ attempts: 1, mastery_score: 80 });
});

test("a missed quiz question comes back in Fix your mistakes", async ({ page, student }) => {
  await loginAs(page, student);
  await page.goto(`/chapters/${IDS.handHygiene}?tab=quiz`);
  const missed = await takeQuizMissingFirst(page);
  await expect(page.getByRole("heading", { name: "4 out of 5" })).toBeVisible();

  // Mistakes come back the next day.
  await ageAnswers(student.id, 2);
  await page.goto("/home");
  await page.getByRole("link", { name: /1 question to revisit/ }).click();
  await expect(page).toHaveURL(/\/review$/);

  await expect(page.getByText("You missed this one before")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(missed.prompt);
  await page.getByRole("radio").nth(missed.correct).click();
  await expect(page.getByText("That's right.")).toBeVisible();

  const { data: answers } = await admin()
    .from("question_answers")
    .select("question_id, correct, source")
    .eq("user_id", student.id)
    .eq("source", "review");
  expect(answers).toEqual([{ question_id: missed.id, correct: true, source: "review" }]);
});
