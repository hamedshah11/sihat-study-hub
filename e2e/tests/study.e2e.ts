import { ACCOUNTS } from "../fixtures/accounts.ts";
import { MICRO_CH1 } from "../fixtures/curriculum.ts";
import { adminClient } from "../support/admin.ts";
import { localSupabase } from "../support/env.ts";
import { ageAnswers } from "../support/scenarios.ts";
import { answer, finishQuiz, options } from "../support/study.ts";
import { expect, startAs, test } from "../support/test.ts";

test("today's review: rate ten cards, then the rose and days in a row", async ({ page }) => {
  await startAs(page, "review");
  const startedAt = new Date().toISOString();

  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "10 cards" })).toBeVisible();
  await page.getByRole("link", { name: "Start review" }).click();

  for (let i = 1; i <= 10; i++) {
    await expect(page.getByText(`${i} of 10`)).toBeVisible();
    await expect(page.locator(".fl-question")).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).last().click();
    await expect(page.getByText("Answer", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Good: Got it/ }).click();
  }

  await expect(page.getByText("Session complete · 10 cards")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Progress rose: Microbiology \d+%/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^Your Microbiology petal (grew|held steady)\.$/ }),
  ).toBeVisible();
  // Four days before today, plus today.
  await expect(page.getByText("5 days in a row")).toBeVisible();

  // Every rating was saved by the server.
  const { count } = await adminClient()
    .from("flashcard_reviews")
    .select("flashcard_id", { count: "exact", head: true })
    .eq("user_id", ACCOUNTS.review.id)
    .gte("last_review", startedAt);
  expect(count).toBe(10);
});

test("chapter quiz: one tap shows the feedback, and the server keeps the score", async ({
  page,
}) => {
  await startAs(page, "quiz");
  await page.goto(`/chapters/${MICRO_CH1.id}?tab=quiz`);
  await expect(page.getByText("1 of 5")).toBeVisible();

  // One tap on a wrong option: the answer locks and the feedback shows straight away.
  const { question, pick } = await answer(page, { right: false });
  await expect(options(page).nth(pick)).toContainText("Your answer");
  await expect(options(page).nth(question.correct)).toContainText("Correct answer");
  await expect(page.getByText(question.explanation)).toBeVisible();
  // A locked answer can't be changed.
  await expect(options(page).nth(question.correct)).toBeDisabled();

  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByText("2 of 5")).toBeVisible();
  await answer(page, { right: true });
  await expect(page.getByText("Your answer")).toHaveCount(0);
  await expect(page.getByText("Correct answer")).toHaveCount(1);

  await finishQuiz(page, { right: true });
  await expect(page.getByRole("heading", { name: "4 out of 5" })).toBeVisible();
  await expect(page.getByText("The one you missed")).toBeVisible();

  // The score shown came from the server: one attempt, graded from the locked answers.
  const { data: attempts } = await adminClient()
    .from("quiz_attempts")
    .select("chapter_id, score, total_questions")
    .eq("user_id", ACCOUNTS.quiz.id);
  expect(attempts).toEqual([{ chapter_id: MICRO_CH1.id, score: 4, total_questions: 5 }]);
  const { data: progress } = await adminClient()
    .from("chapter_progress")
    .select("attempts, mastery_score")
    .eq("user_id", ACCOUNTS.quiz.id)
    .eq("chapter_id", MICRO_CH1.id)
    .single();
  expect(progress).toEqual({ attempts: 1, mastery_score: 80 });
});

test("fix your mistakes: a wrong quiz answer comes back the next day", async ({ page }) => {
  await startAs(page, "mistakes");
  await page.goto(`/chapters/${MICRO_CH1.id}?tab=quiz`);
  const { question } = await answer(page, { right: false });
  await finishQuiz(page, { right: true });

  // A day later.
  await ageAnswers(ACCOUNTS.mistakes.id, 1.05);

  await page.goto("/home");
  await page.getByRole("link", { name: /1 question to revisit/ }).click();
  await expect(page.getByText("You missed this one before")).toBeVisible();
  await expect(page.locator("h2.fl-question")).toHaveText(question.prompt);

  await options(page).nth(question.correct).click();
  await expect(page.getByText("That's right.")).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "1 out of 1" })).toBeVisible();
  await expect(page.getByText("1 back once more in 3 days")).toBeVisible();

  const { data: reviewed } = await adminClient()
    .from("question_answers")
    .select("correct")
    .eq("user_id", ACCOUNTS.mistakes.id)
    .eq("source", "review");
  expect(reviewed).toEqual([{ correct: true }]);
});

test("Ask Florence answers from the chapter notes", async ({ page }) => {
  // tutor-ask runs in the local edge runtime, which downloads its imports from
  // esm.sh when it boots. Without internet inside Docker it can't, so skip
  // locally; CI always runs it.
  const { url, anonKey } = localSupabase();
  const probe = await fetch(`${url}/functions/v1/tutor-ask`, {
    method: "POST",
    headers: { authorization: `Bearer ${anonKey}`, "content-type": "application/json" },
    body: "{}",
  });
  const bootError = probe.status >= 500 && (await probe.text()).includes("BOOT_ERROR");
  test.skip(bootError && !process.env.CI, "the local edge runtime can't download its imports");

  await startAs(page, "tutor");
  await page.goto(`/chapters/${MICRO_CH1.id}`);
  await page.getByRole("button", { name: "Ask Florence about this chapter" }).click();
  await expect(page.getByText("Ask anything about this chapter.")).toBeVisible();

  await page.getByLabel("Ask about this chapter").fill("When should I clean my hands?");
  await page.getByRole("button", { name: "Send" }).click();

  // The fixed reply from the Anthropic stub, with its source checked against the notes.
  await expect(page.getByText("When should I clean my hands?")).toBeVisible();
  await expect(page.getByText(/^Clean your hands at the five moments/)).toBeVisible();
  await page.getByRole("button", { name: "Source: Hand hygiene" }).click();
  await expect(page.getByRole("heading", { name: "Hand hygiene" })).toBeInViewport();

  const { data: messages } = await adminClient()
    .from("tutor_messages")
    .select("role")
    .eq("user_id", ACCOUNTS.tutor.id)
    .order("role");
  expect(messages).toEqual([{ role: "assistant" }, { role: "user" }]);
});
