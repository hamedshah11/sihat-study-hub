// Joining with a batch code, and signing in with an email code or a phone code.

import { randomUUID } from "node:crypto";
import { admin, deleteUser } from "../support/admin.ts";
import { emailCode, expect, test } from "../support/fixtures.ts";
import { ACCOUNTS, BATCH_CODE, IDS, TEST_SMS_CODE } from "../support/seed-data.ts";

test("a new student joins with a batch code and lands on Today", async ({ page }) => {
  const email = `join-${randomUUID().slice(0, 8)}@florence.test`;
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "I have a batch code" }).click();
    await expect(page).toHaveURL(/\/signup$/);

    await page.getByLabel("Batch code").fill(BATCH_CODE);
    const found = page.getByText("Code found. Is this you?");
    await expect(found).toBeVisible();
    const details = page.locator("dl");
    await expect(details).toContainText("SIHAT, Khairpur Mirs");
    await expect(details).toContainText("BSN Generic");
    await expect(details).toContainText("Semester 1");
    await expect(details).toContainText("2, with 3 chapters ready");

    await page.getByLabel("Your name").fill("Zainab Qureshi");
    await page.getByRole("button", { name: "Use email instead" }).click();
    await page.getByLabel("Email").fill(email);
    const sentAt = Date.now() - 1000;
    await page.getByRole("button", { name: "Join batch" }).click();

    await expect(page.getByText(`We sent a 6-digit code to ${email}`)).toBeVisible();
    await page.getByLabel("Code").fill(await emailCode(email, sentAt));
    await page.getByRole("button", { name: "Continue" }).click();

    // New students meet the rose once, then start their first review.
    await expect(page.getByRole("heading", { name: "Each petal is a subject." })).toBeVisible();
    await expect(page.getByText("You've joined your batch.")).toBeVisible();
    await page.getByRole("link", { name: /Start my first review/ }).click();
    await page.getByRole("button", { name: "End session" }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Zainab.");

    const { data: profile } = await admin()
      .from("profiles")
      .select("id, batch_id, display_name, student_type")
      .eq("email", email)
      .single();
    expect(profile).toMatchObject({
      batch_id: IDS.batchA,
      display_name: "Zainab Qureshi",
      student_type: "internal",
    });
  } finally {
    const { data } = await admin().from("profiles").select("id").eq("email", email);
    for (const row of data ?? []) await deleteUser(row.id);
  }
});

test("a student signs in with a code sent by email", async ({ page }) => {
  const sana = ACCOUNTS.student;
  await page.goto("/login");
  await page.getByLabel("Phone number or email").fill(sana.email);
  // Leaving the password empty asks for a code instead.
  await expect(page.getByLabel("Password")).toBeVisible();
  const sentAt = Date.now() - 1000;
  await page.getByRole("button", { name: "Send me a code" }).click();

  await expect(page.getByText(`We sent a 6-digit code to ${sana.email}`)).toBeVisible();
  await page.getByLabel("Code").fill(await emailCode(sana.email, sentAt));
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sana.");
});

test("a student signs in with a code sent to their phone", async ({ page }) => {
  const sana = ACCOUNTS.student;
  await page.goto("/login");
  await page.getByLabel("Phone number or email").fill(sana.phoneTyped);
  await page.getByRole("button", { name: "Send me a code" }).click();

  await expect(
    page.getByText(`We sent a 6-digit code by SMS to ${sana.phoneTyped}.`),
  ).toBeVisible();
  await page.getByLabel("Code").fill(TEST_SMS_CODE);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sana.");
});

test("a wrong code is refused in plain words", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Phone number or email").fill(ACCOUNTS.student.phoneTyped);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That code didn't work. Check it, or send a new one.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
