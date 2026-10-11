import {
  ACCOUNTS,
  E2E_PASSWORD,
  JOIN_EMAIL_PREFIX,
  type Account,
  type AccountKey,
} from "./fixtures/accounts.ts";
import {
  BATCH,
  BATCH_CODE,
  CHAPTERS,
  CONTENT_UPDATED_AT,
  FUNDAMENTALS_2,
  ANATOMY,
  CELL_DIAGRAM,
  MICROBIOLOGY,
  PROGRAMME,
  SEMESTER_1,
  SEMESTER_2,
  flashcardId,
  questionId,
} from "./fixtures/curriculum.ts";
import { readFileSync } from "node:fs";
import { adminClient, must } from "./support/admin.ts";
import { resetDraftChapter, resetStudent } from "./support/scenarios.ts";

// Seeds the LOCAL Supabase stack for the end-to-end tests. Idempotent: every
// row has a fixed id and is upserted, so it can run before every test run.
// Uses the local service-role key from `supabase status`; it refuses any
// Supabase URL that isn't on this machine (see support/env.ts).

async function seedCurriculum() {
  const db = adminClient();
  await must("programme", db.from("programs").upsert(PROGRAMME));
  await must(
    "semesters",
    db.from("semesters").upsert([
      { ...SEMESTER_1, program_id: PROGRAMME.id },
      { ...SEMESTER_2, program_id: PROGRAMME.id },
    ]),
  );
  await must(
    "batch",
    db.from("batches").upsert({
      ...BATCH,
      program_id: PROGRAMME.id,
      current_semester_id: SEMESTER_1.id,
      start_date: "2026-09-01",
    }),
  );
  await must(
    "batch code",
    db.from("invite_codes").upsert(
      {
        code: BATCH_CODE,
        batch_id: BATCH.id,
        max_uses: 100_000,
        used_count: 0,
        expires_at: null,
      },
      { onConflict: "code" },
    ),
  );
  await must("subjects", db.from("subjects").upsert([MICROBIOLOGY, ANATOMY, FUNDAMENTALS_2]));

  const base = Date.parse("2026-09-01T06:00:00.000Z");
  for (const chapter of CHAPTERS) {
    const { questions, flashcards, ...row } = chapter;
    await must(
      `chapter ${chapter.title}`,
      db.from("chapters").upsert({ ...row, updated_at: CONTENT_UPDATED_AT }),
    );
    const questionRows = questions.map((q, i) => ({
      id: questionId(chapter, i),
      chapter_id: chapter.id,
      prompt: q.prompt,
      options: q.options,
      correct_index: q.correct,
      explanation: q.explanation,
      difficulty: q.difficulty ?? "medium",
      status: q.status ?? "approved",
      created_at: new Date(base + i * 1000).toISOString(),
    }));
    await must(`questions for ${chapter.title}`, db.from("questions").upsert(questionRows));
    const cardRows = flashcards.map((c, i) => ({
      id: flashcardId(chapter, i),
      chapter_id: chapter.id,
      front: c.front,
      back: c.back,
      hint: c.hint ?? null,
      card_type: "basic",
      status: "approved",
      created_at: new Date(base + i * 1000).toISOString(),
    }));
    await must(`flashcards for ${chapter.title}`, db.from("flashcards").upsert(cardRows));

    // Anything else in a seeded chapter (left by an earlier version of the
    // seed) would change the counts the tests check.
    const keepQuestions = questionRows.map((q) => q.id);
    const keepCards = cardRows.map((c) => c.id);
    await must(
      "tidy questions",
      db
        .from("questions")
        .delete()
        .eq("chapter_id", chapter.id)
        .not("id", "in", `(${keepQuestions.join(",")})`),
    );
    await must(
      "tidy flashcards",
      db
        .from("flashcards")
        .delete()
        .eq("chapter_id", chapter.id)
        .not("id", "in", `(${keepCards.join(",")})`),
    );
  }
}

/** The diagram figure in "The cell", with its image in the private diagrams bucket. */
async function seedDiagram() {
  const db = adminClient();
  const { data: bucket } = await db.storage.getBucket("diagrams");
  if (!bucket) {
    const { error } = await db.storage.createBucket("diagrams", { public: false });
    if (error) throw new Error(`diagrams bucket: ${error.message}`);
  }
  const image = readFileSync(new URL("../public/icon-192.png", import.meta.url));
  const { error } = await db.storage
    .from("diagrams")
    .upload(CELL_DIAGRAM.image_path, image, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`diagram image: ${error.message}`);
  await must("diagram", db.from("diagram_labels").upsert(CELL_DIAGRAM));
}

type AuthUser = { id: string; email?: string; phone?: string };

async function listUsers(): Promise<AuthUser[]> {
  const db = adminClient();
  const users: AuthUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list users: ${error.message}`);
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email, phone: u.phone })));
    if (data.users.length < 1000) break;
  }
  return users;
}

async function seedAccount(account: Account, existing: AuthUser[]) {
  const db = adminClient();
  const phoneDigits = account.phone?.replace(/^\+/, "");
  // Someone else holding this email or phone (an earlier run that made the
  // account with a different id) would block the fixed id.
  for (const u of existing) {
    const sameEmail = account.email && u.email === account.email;
    const samePhone = phoneDigits && u.phone === phoneDigits;
    if ((sameEmail || samePhone) && u.id !== account.id) {
      await db.auth.admin.deleteUser(u.id);
    }
  }
  const attributes = {
    email: account.email,
    phone: account.phone,
    password: E2E_PASSWORD,
    email_confirm: Boolean(account.email),
    phone_confirm: Boolean(account.phone),
    user_metadata: { display_name: account.name },
  };
  if (existing.some((u) => u.id === account.id)) {
    const { error } = await db.auth.admin.updateUserById(account.id, attributes);
    if (error) throw new Error(`update ${account.key}: ${error.message}`);
  } else {
    const { error } = await db.auth.admin.createUser({ id: account.id, ...attributes });
    if (error) throw new Error(`create ${account.key}: ${error.message}`);
  }
  // Role, batch and student type are protected columns: only trusted
  // (service-role) writes like this one can set them.
  await must(
    `profile ${account.key}`,
    db
      .from("profiles")
      .update({
        display_name: account.name,
        email: account.email ?? null,
        role: account.role,
        batch_id: account.role === "student" ? BATCH.id : null,
        student_type: "internal",
      })
      .eq("id", account.id),
  );
}

async function seedAccounts() {
  const db = adminClient();
  const existing = await listUsers();
  // Students made by earlier runs of the join journey.
  for (const u of existing) {
    if (u.email?.startsWith(JOIN_EMAIL_PREFIX) && u.email.endsWith("@example.com")) {
      await db.auth.admin.deleteUser(u.id);
    }
  }
  for (const account of Object.values(ACCOUNTS)) await seedAccount(account, existing);
  for (const key of Object.keys(ACCOUNTS) as AccountKey[]) {
    if (ACCOUNTS[key].role === "student") await resetStudent(key);
  }
}

export async function seed() {
  await seedCurriculum();
  await seedDiagram();
  await resetDraftChapter();
  await seedAccounts();
}

// `npm run e2e:seed` runs this file directly.
if (process.argv[1]?.endsWith("seed.ts")) {
  seed()
    .then(() => console.log("Seeded the local Supabase stack for the end-to-end tests."))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
