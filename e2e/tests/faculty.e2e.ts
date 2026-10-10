import { VITALS_DRAFT } from "../fixtures/curriculum.ts";
import { adminClient } from "../support/admin.ts";
import { expectNoHorizontalOverflow } from "../support/layout.ts";
import { resetDraftChapter } from "../support/scenarios.ts";
import { expect, signInAs, test } from "../support/test.ts";

// The faculty console is used on a laptop.
test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

test.beforeEach(async ({ page }) => {
  await resetDraftChapter();
  await signInAs(page, "faculty");
});

test("faculty review: approve, edit and reject drafts; publishing waits for the checklist", async ({
  page,
}) => {
  await page.goto(`/admin/review?chapter=${VITALS_DRAFT.id}`);
  await expect(page.getByRole("heading", { name: "Vital signs" })).toBeVisible();
  const approved = page.getByText(/^\d+ of \d+$/).first();
  const publish = page.getByRole("button", { name: "Publish to students" });
  const questions = page.locator("ol > li");
  // The middle column: the draft being reviewed.
  const draft = page.locator("section").nth(1);

  await expect(approved).toHaveText("13 of 18");
  await expect(page.getByText("At least 15 approved questions (13)")).toBeVisible();
  await expect(publish).toBeDisabled();

  // Approve the first draft (question 14).
  await expect(draft.getByText("Question 14 · AI draft · not yet reviewed")).toBeVisible();
  await draft.getByRole("button", { name: "Approve" }).click();
  await expect(approved).toHaveText("14 of 18");
  await expect(questions.nth(13)).toContainText("Approved");
  await expect(publish).toBeDisabled();

  // Edit an approved question: it goes back to draft.
  await questions.nth(0).getByRole("button").click();
  await expect(draft.getByText("Question 1 · approved")).toBeVisible();
  await draft.getByRole("button", { name: "Edit" }).click();
  await draft.locator("textarea").first().fill("What is the normal resting pulse in an adult?");
  await draft.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved. It needs approving again.")).toBeVisible();
  await expect(questions.nth(0)).toContainText("What is the normal resting pulse in an adult?");
  await expect(questions.nth(0)).toContainText("To review");
  await expect(approved).toHaveText("13 of 18");

  // Reject a draft: it leaves the list.
  await questions.nth(14).getByRole("button").click();
  await expect(draft.getByText("Question 15 · AI draft · not yet reviewed")).toBeVisible();
  const rejected = await draft.locator("h2").innerText();
  await draft.getByRole("button", { name: "Reject" }).click();
  await expect(approved).toHaveText("13 of 17");
  await expect(questions.filter({ hasText: rejected })).toHaveCount(0);
  await expect(publish).toBeDisabled();

  // Two more approvals pass the checklist.
  for (const n of [1, 15]) {
    await questions
      .nth(n - 1)
      .getByRole("button")
      .click();
    await expect(draft.getByText(`Question ${n} · AI draft · not yet reviewed`)).toBeVisible();
    await draft.getByRole("button", { name: "Approve" }).click();
  }
  await expect(approved).toHaveText("15 of 17");
  await expect(page.getByText("At least 15 approved questions (15)")).toBeVisible();
  await expect(publish).toBeEnabled();

  await expectNoHorizontalOverflow(page);

  await publish.click();
  await expect(page.getByText("Published. Students see it at their next sync.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Published" })).toBeDisabled();
  const { data: chapter } = await adminClient()
    .from("chapters")
    .select("status")
    .eq("id", VITALS_DRAFT.id)
    .single();
  expect(chapter).toEqual({ status: "published" });
});

test("faculty pages fit a 1280 px screen", async ({ page }) => {
  for (const path of [
    `/admin/review?chapter=${VITALS_DRAFT.id}`,
    "/admin",
    `/admin/chapters/${VITALS_DRAFT.id}`,
    "/admin/reports",
    "/admin/invite-codes",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Faculty navigation" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page);
  }
});
