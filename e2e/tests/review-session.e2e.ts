// Today's review: rate the due cards, reach session complete, see the rose
// and days in a row. The ratings are saved and scheduled on the server.

import { admin } from "../support/admin.ts";
import { expect, loginAs, test } from "../support/fixtures.ts";
import { IDS } from "../support/seed-data.ts";
import { giveDueCards } from "../support/study.ts";

test("rating ten due cards ends on session complete with the rose", async ({ page, student }) => {
  await giveDueCards(student.id, IDS.vitalSigns, 10);
  const started = Date.now();
  await loginAs(page, student);
  await page.goto("/home");

  const card = page.locator("section", { hasText: "Start review" });
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("10 cards");
  await card.getByRole("link", { name: "Start review" }).click();
  await expect(page).toHaveURL(/\/session$/);

  for (let n = 1; n <= 10; n++) {
    await expect(page.getByText(`${n} of 10`)).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).last().click();
    await expect(page.getByText("Answer", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Good: Got it/ }).click();
  }

  await expect(page.getByText("Session complete · 10 cards")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Progress rose: Fundamentals of Nursing/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Your Fundamentals of Nursing petal (grew|held steady)\./,
  );
  await expect(page.getByText("1 day in a row")).toBeVisible();

  // Every rating reached the server and was scheduled there.
  const { data: reviews } = await admin()
    .from("flashcard_reviews")
    .select("last_review, due_at, reps")
    .eq("user_id", student.id);
  expect(reviews).toHaveLength(10);
  for (const review of reviews ?? []) {
    expect(Date.parse(review.last_review)).toBeGreaterThanOrEqual(started - 5_000);
    expect(Date.parse(review.due_at)).toBeGreaterThan(Date.now());
    expect(review.reps).toBe(3);
  }
  const { data: streak } = await admin()
    .from("streaks")
    .select("current_streak")
    .eq("user_id", student.id)
    .single();
  expect(streak?.current_streak).toBe(1);

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/home$/);
});
