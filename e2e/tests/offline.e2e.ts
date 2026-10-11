import type { Page } from "@playwright/test";
import { ACCOUNTS } from "../fixtures/accounts.ts";
import { ANAT_CH1, ANATOMY, CELL_DIAGRAM, MICRO_CH2 } from "../fixtures/curriculum.ts";
import { expect, signInAs, startAs, test } from "../support/test.ts";

// Offline reading: download a chapter, lose the signal, start the app again
// cold and read it. The service worker is part of what's being tested here,
// so these tests let it run (the others block it so they always hit the
// server).

test.use({ serviceWorkers: "allow" });

const CHAPTER = `/chapters/${ANAT_CH1.id}`;

/** Download the chapter from its page, once the service worker can keep the pages. */
async function downloadChapter(page: Page) {
  await page.goto(CHAPTER);
  await expect(page.getByRole("heading", { name: "Plasma membrane" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "Download for offline" }).click();
  await expect(page.getByText("Available offline")).toBeVisible();
  // The service worker kept the chapter page for a cold start.
  await expect
    .poll(() => page.evaluate((url) => caches.match(url).then(Boolean), CHAPTER))
    .toBe(true);
}

/** Rows in the downloads database, counted by the user id they belong to. */
function storedDownloads(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const open = indexedDB.open("florence-downloads");
        // Don't create the database if the app never did.
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => (open.error?.name === "AbortError" ? resolve({}) : reject(open.error));
        open.onsuccess = () => {
          const db = open.result;
          const counts: Record<string, number> = {};
          const tx = db.transaction(Array.from(db.objectStoreNames));
          for (const name of Array.from(db.objectStoreNames)) {
            const request = tx.objectStore(name).getAll();
            request.onsuccess = () => {
              for (const row of request.result as { userId: string }[]) {
                counts[row.userId] = (counts[row.userId] ?? 0) + 1;
              }
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve(counts);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

/** Make the stored access token look an hour old, as after a night without signal. */
async function expireAccessToken(page: Page) {
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    if (!key) throw new Error("No stored session");
    const session = JSON.parse(localStorage.getItem(key)!);
    session.expires_at = Math.floor(Date.now() / 1000) - 3600;
    localStorage.setItem(key, JSON.stringify(session));
  });
}

test("a downloaded chapter opens with no signal, and logging out removes it", async ({
  page,
  context,
}) => {
  const student = ACCOUNTS.offline;
  await startAs(page, "offline");
  await downloadChapter(page);
  expect((await storedDownloads(page))[student.id]).toBeGreaterThan(0);

  // No signal, and the access token has expired: the app must neither sign
  // her out nor send her to /login.
  await context.setOffline(true);
  await expireAccessToken(page);
  await page.reload();

  await expect(page).toHaveURL(CHAPTER);
  await expect(page.getByText("You're offline")).toBeVisible();
  await expect(page.getByRole("heading", { name: ANAT_CH1.title, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plasma membrane" })).toBeVisible();
  await expect(page.getByText("Available offline")).toBeVisible();
  // The diagram is the image file stored on the phone, not a link to the server.
  const figure = page.getByRole("img", { name: CELL_DIAGRAM.title });
  await expect(figure).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() => figure.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  // Flashcards flip; ratings say plainly that they need internet.
  await page.getByRole("button", { name: /^Practise this chapter/ }).click();
  const total = ANAT_CH1.flashcards.length;
  await expect(page.getByText(`1 of ${total}`)).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).last().click();
  await expect(page.getByText("Answer", { exact: true })).toBeVisible();
  await expect(page.getByText("Saving reviews needs internet")).toBeVisible();
  for (const name of [/^Again: Forgot/, /^Hard: Barely/, /^Good: Got it/, /^Easy: Instant/]) {
    await expect(page.getByRole("button", { name })).toBeDisabled();
  }
  await page.getByRole("button", { name: "Next card" }).click();
  await expect(page.getByText(`2 of ${total}`)).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).last().click();
  await expect(page.getByText("Saving reviews needs internet")).toBeVisible();

  // A chapter that was never opened or downloaded: the app still starts (the
  // service worker serves the chapter shell) and says so plainly.
  await page.goto(`/chapters/${MICRO_CH2.id}`);
  await expect(page.getByRole("heading", { name: "This chapter isn't downloaded." })).toBeVisible();

  // The subject and Settings, opened cold with no signal.
  await page.goto(`/subjects/${ANATOMY.id}`);
  await expect(page.getByText("You're offline. These chapters are downloaded")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(ANAT_CH1.title) })).toBeVisible();

  await page.goto("/profile");
  await page.getByRole("button", { name: /^Downloads/ }).click();
  const list = page.getByRole("list", { name: "Downloaded chapters" });
  await expect(list.getByText(ANAT_CH1.title)).toBeVisible();
  await expect(list.getByText(/^Anatomy and Physiology I · \d+ KB$/)).toBeVisible();
  await expect(page.getByText(/^Florence uses .+ on this phone in all/)).toBeVisible();

  // She logs out, still with no signal: her downloads and her session leave
  // the phone with her.
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await storedDownloads(page)).toEqual({});
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sb-"))),
  ).toEqual([]);

  // The next student on this phone sees none.
  await context.setOffline(false);
  await signInAs(page, "offlineSecond");
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: /^Downloads/ })).toContainText(
    "Nothing downloaded",
  );
});

test("a second account on the same phone never sees the first one's downloads", async ({
  page,
  context,
}) => {
  const first = ACCOUNTS.offline;
  await startAs(page, "offline");
  await downloadChapter(page);

  // She doesn't log out; someone else signs in on the same phone.
  await startAs(page, "offlineSecond");
  // Her downloads are still stored, under her own id...
  expect((await storedDownloads(page))[first.id]).toBeGreaterThan(0);

  // ...and none of them reach the second student.
  await page.goto(CHAPTER);
  await expect(page.getByRole("heading", { name: "Plasma membrane" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download for offline" })).toBeVisible();
  await expect(page.getByText("Available offline")).toHaveCount(0);

  await page.goto("/profile");
  await expect(page.getByRole("button", { name: /^Downloads/ })).toContainText(
    "Nothing downloaded",
  );

  await context.setOffline(true);
  await page.goto(CHAPTER);
  await expect(page.getByRole("heading", { name: "This chapter isn't downloaded." })).toBeVisible();
  await page.goto("/subjects");
  await expect(page.getByRole("heading", { name: "Nothing is downloaded yet." })).toBeVisible();
});
