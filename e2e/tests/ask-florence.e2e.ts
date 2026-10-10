// Ask Florence: the question goes to the real tutor-ask edge function on the
// local stack, which calls the Anthropic stub (e2e/stubs/anthropic.ts)
// instead of the real API.

import { admin } from "../support/admin.ts";
import { expect, loginAs, test } from "../support/fixtures.ts";
import { IDS, TUTOR_STUB_SOURCE } from "../support/seed-data.ts";
import { STUB_PORT, STUB_REPLY } from "../stubs/anthropic.ts";

test("asking about a chapter shows Florence's answer and its source", async ({ page, student }) => {
  const question = `What is a normal adult pulse? (${student.id.slice(0, 8)})`;
  await loginAs(page, student);
  await page.goto(`/chapters/${IDS.vitalSigns}`);
  await page.getByRole("button", { name: "Ask Florence about this chapter" }).click();

  await expect(page.getByRole("heading", { name: "Ask Florence" })).toBeVisible();
  await expect(page.getByText("AI tutor.")).toBeVisible();
  await page.getByLabel("Ask about this chapter").fill(question);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(question)).toBeVisible();
  await expect(page.getByText(STUB_REPLY.split("\n")[0])).toBeVisible();
  await expect(page.getByRole("button", { name: `Source: ${TUTOR_STUB_SOURCE}` })).toBeVisible();

  // The edge function sent the chapter notes and the house rules, not just the question.
  const received = (await (await fetch(`http://127.0.0.1:${STUB_PORT}/requests`)).json()) as {
    model: string;
    system: string;
    question: string;
  }[];
  const call = received.find((r) => r.question === question);
  expect(call, "tutor-ask called the Anthropic stub").toBeTruthy();
  expect(call!.model).toBe("claude-haiku-4-5");
  expect(call!.system).toContain("Answer ONLY using the chapter notes");
  expect(call!.system).toContain("Never invent drug doses");
  expect(call!.system).toContain("A normal adult resting pulse is 60 to 100 beats a minute.");

  // Both sides of the conversation were saved by the trusted path.
  const { data: messages } = await admin()
    .from("tutor_messages")
    .select("role, content")
    .eq("user_id", student.id)
    .order("role", { ascending: false });
  expect(messages?.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(messages?.[1].content).toBe(STUB_REPLY);

  // The source chip opens the cited section of the notes.
  await page.getByRole("button", { name: `Source: ${TUTOR_STUB_SOURCE}` }).click();
  await expect(page.getByRole("heading", { name: TUTOR_STUB_SOURCE, level: 2 })).toBeInViewport();
});
