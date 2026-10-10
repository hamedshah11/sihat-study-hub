import { ACCOUNTS, JOIN_EMAIL_PREFIX, TEST_PHONE } from "../fixtures/accounts.ts";
import { BATCH, BATCH_CODE } from "../fixtures/curriculum.ts";
import { adminClient } from "../support/admin.ts";
import { latestCode } from "../support/mail.ts";
import { resetStudent } from "../support/scenarios.ts";
import { expect, test } from "../support/test.ts";

test("a new student joins with the batch code and lands on Today", async ({ page }) => {
  const email = `${JOIN_EMAIL_PREFIX}${Date.now()}@example.com`;

  await page.goto("/");
  await page.getByRole("link", { name: "I have a batch code" }).click();
  await expect(page.getByRole("link", { name: "Join your batch" })).toBeVisible();

  await page.getByLabel("Batch code").fill(BATCH_CODE);
  await expect(page.getByText("Code found. Is this you?")).toBeVisible();
  const found = page.locator("dl");
  await expect(found).toContainText("BSN Generic");
  await expect(found).toContainText("Semester 1");
  await expect(found).toContainText("2, with 3 chapters ready");

  await page.getByLabel("Your name").fill("Mehwish Khan");
  await page.getByRole("button", { name: "Use email instead" }).click();
  await page.getByLabel("Email").fill(email);
  const sentAt = new Date();
  await page.getByRole("button", { name: "Join batch" }).click();

  await expect(page.getByText("We sent a 6-digit code to")).toBeVisible();
  await page.getByLabel("Code").fill(await latestCode(email, sentAt));
  await page.getByRole("button", { name: "Continue" }).click();

  // A new student meets the rose first, then Today.
  await expect(page.getByRole("heading", { name: "Each petal is a subject." })).toBeVisible();
  await expect(page.getByText("You've joined your batch.")).toBeVisible();
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Welcome, Mehwish." })).toBeVisible();
  await expect(page.getByText("Your first review", { exact: true })).toBeVisible();

  // The batch code was redeemed on the server.
  const { data: profile } = await adminClient()
    .from("profiles")
    .select("batch_id, display_name")
    .eq("email", email)
    .single();
  expect(profile).toEqual({ batch_id: BATCH.id, display_name: "Mehwish Khan" });
});

test("a returning student signs in with an email code", async ({ page }) => {
  await resetStudent("signIn");
  const { email } = ACCOUNTS.signIn;

  await page.goto("/");
  await page.getByRole("link", { name: "Sign in with phone or email" }).click();
  await page.getByLabel("Phone number or email").fill(email);
  // Leaving the password empty asks for a code instead.
  await expect(page.getByLabel("Password")).toBeVisible();
  const sentAt = new Date();
  await page.getByRole("button", { name: "Send me a code" }).click();

  await expect(page.getByText(`We sent a 6-digit code to ${email}`)).toBeVisible();
  await page.getByLabel("Code").fill(await latestCode(email, sentAt));
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), Sana\.$/,
  );
});

test("a returning student signs in with the test phone number", async ({ page }) => {
  await resetStudent("phone");

  await page.goto("/login");
  await page.getByLabel("Phone number or email").fill(TEST_PHONE.typed);
  await page.getByRole("button", { name: "Send me a code" }).click();

  await expect(
    page.getByText(`We sent a 6-digit code by SMS to ${TEST_PHONE.typed}`),
  ).toBeVisible();
  await page.getByLabel("Code").fill(TEST_PHONE.code);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), Bilal\.$/,
  );
});
