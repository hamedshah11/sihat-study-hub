// Faculty review on a laptop: approve, edit (back to draft) and reject AI
// drafts, and "Publish to students" stays off until the checklist passes.
//
// The test makes its own chapter in Semester 2, which no test student is
// in, so publishing it never changes what students see in other tests.

import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { admin, must } from "../support/admin.ts";
import { expect, loginAs, test } from "../support/fixtures.ts";
import { ACCOUNTS, CHAPTERS, IDS } from "../support/seed-data.ts";

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

const vital = CHAPTERS.find((c) => c.id === IDS.vitalSigns)!;
const wound = CHAPTERS.find((c) => c.id === IDS.woundCare)!;

/** 14 approved questions (one short of the checklist), 3 drafts, 25 approved cards. */
async function makeChapter() {
  const id = randomUUID();
  await must(
    "chapter",
    admin()
      .from("chapters")
      .insert({
        id,
        subject_id: IDS.communityHealth,
        title: `Vital signs review ${id.slice(0, 4)}`,
        summary_md: vital.notes,
        display_order: 1,
        status: "draft",
      }),
  );
  const questions = [
    ...vital.questions.map((q, i) => ({ ...q, status: i < 14 ? "approved" : "draft" })),
    ...wound.questions.slice(2, 4).map((q) => ({ ...q, status: "draft" })),
  ];
  await must(
    "questions",
    admin()
      .from("questions")
      .insert(
        questions.map((q, i) => ({
          chapter_id: id,
          prompt: q.prompt,
          options: q.options,
          correct_index: q.correct,
          explanation: q.explanation,
          status: q.status,
          created_at: new Date(Date.parse("2026-10-01T09:00:00Z") + i * 1000).toISOString(),
        })),
      ),
  );
  await must(
    "flashcards",
    admin()
      .from("flashcards")
      .insert(
        vital.cards.map((c) => ({
          chapter_id: id,
          front: c.front,
          back: c.back,
          status: "approved",
        })),
      ),
  );
  return { id, drafts: questions.filter((q) => q.status === "draft").map((q) => q.prompt) };
}

const listItem = (page: Page, prompt: string) => page.locator("ol button", { hasText: prompt });
const publish = (page: Page) => page.getByRole("button", { name: "Publish to students" });

async function expectNothingCutOff(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.right > width + 1 || box.left < -1);
      })
      .filter((el) => getComputedStyle(el).visibility !== "hidden")
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      width,
      offenders: offenders.slice(0, 10),
    };
  });
  expect(overflow.offenders, "Elements reaching past the right edge").toEqual([]);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);
}

test("approve, edit and reject drafts; publishing waits for the checklist", async ({ page }) => {
  const chapter = await makeChapter();
  try {
    await loginAs(page, ACCOUNTS.faculty);
    await page.goto(`/admin/review?chapter=${chapter.id}`);

    const checklist = page.getByText("Before this chapter can publish").locator("..");
    await expect(checklist).toContainText("At least 15 approved questions (14)");
    await expect(checklist).toContainText("At least 25 approved flashcards (25)");
    await expect(checklist).toContainText("Summary notes written and reviewed");
    await expect(publish(page)).toBeDisabled();
    await expectNothingCutOff(page);

    // Approve the first draft: the checklist passes and publishing switches on.
    const [first, second, third] = chapter.drafts;
    await expect(page.getByText(/AI draft · not yet reviewed/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: first })).toBeVisible();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(listItem(page, first)).toContainText("Approved");
    await expect(checklist).toContainText("At least 15 approved questions (15)");
    await expect(publish(page)).toBeEnabled();

    // Edit an approved question: it goes back to draft and publishing is off again.
    const edited = vital.questions[0].prompt;
    await listItem(page, edited).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator("textarea").first().fill(`${edited} (adult at rest)`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved. It needs approving again.")).toBeVisible();
    await expect(listItem(page, `${edited} (adult at rest)`)).toContainText("To review");
    await expect(checklist).toContainText("At least 15 approved questions (14)");
    await expect(publish(page)).toBeDisabled();

    // Reject a draft: it leaves the list, and publishing stays off.
    await listItem(page, second).click();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(listItem(page, second)).toHaveCount(0);
    await expect(publish(page)).toBeDisabled();

    const { data: rows } = await admin()
      .from("questions")
      .select("prompt, status")
      .eq("chapter_id", chapter.id);
    const statusOf = (prompt: string) => rows?.find((r) => r.prompt === prompt)?.status;
    expect(statusOf(first)).toBe("approved");
    expect(statusOf(`${edited} (adult at rest)`)).toBe("draft");
    expect(statusOf(second)).toBe("rejected");
    expect(statusOf(third)).toBe("draft");

    // Approving the edited question passes the checklist again; now it can publish.
    await listItem(page, `${edited} (adult at rest)`).click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(publish(page)).toBeEnabled();
    await publish(page).click();
    await expect(page.getByText("Published. Students see it at their next sync.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Published" })).toBeDisabled();
    const { data: published } = await admin()
      .from("chapters")
      .select("status")
      .eq("id", chapter.id)
      .single();
    expect(published?.status).toBe("published");
    await expectNothingCutOff(page);
  } finally {
    await admin().from("chapters").delete().eq("id", chapter.id);
  }
});
