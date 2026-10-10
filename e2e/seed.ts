// Seeds the LOCAL Supabase stack for the end-to-end tests. Safe to re-run: it
// puts the curriculum, the three accounts and their progress back to a known
// state. Playwright runs it before every test run (global-setup.ts); you can
// also run it on its own with `npm run e2e:seed`.
//
// Uses the local service-role key from `supabase status`. env.ts refuses to
// run against anything but 127.0.0.1, so this can never touch production.

import { admin, must } from "./support/admin.ts";
import { e2eEnv } from "./support/env.ts";
import {
  ACCOUNTS,
  BATCH_B_CODE,
  BATCH_CODE,
  CHAPTERS,
  IDS,
  PASSWORD,
  cardId,
  questionId,
} from "./support/seed-data.ts";
import { sanaWorld, screenshotWorld } from "./support/worlds.ts";

/** Seeded content keeps a fixed "updated" date so the notes footer never changes. */
const CONTENT_DATE = "2026-10-01T09:00:00Z";

async function seedCurriculum() {
  const db = admin();
  await must(
    "programme",
    db.from("programs").upsert({ id: IDS.programme, name: "BSN Generic", total_semesters: 8 }),
  );
  await must(
    "semesters",
    db.from("semesters").upsert([
      { id: IDS.semester1, program_id: IDS.programme, number: 1, name: "Semester 1" },
      { id: IDS.semester2, program_id: IDS.programme, number: 2, name: "Semester 2" },
    ]),
  );
  await must(
    "batches",
    db.from("batches").upsert([
      {
        id: IDS.batchA,
        name: "BSN 2026 Section A",
        program_id: IDS.programme,
        current_semester_id: IDS.semester1,
        start_date: "2026-09-01",
      },
      {
        id: IDS.batchB,
        name: "BSN 2026 Section B",
        program_id: IDS.programme,
        current_semester_id: IDS.semester1,
        start_date: "2026-09-01",
      },
    ]),
  );
  await must(
    "invite codes",
    db.from("invite_codes").upsert([
      { code: BATCH_CODE, batch_id: IDS.batchA, max_uses: 10_000, used_count: 0, expires_at: null },
      {
        code: BATCH_B_CODE,
        batch_id: IDS.batchB,
        max_uses: 10_000,
        used_count: 0,
        expires_at: null,
      },
    ]),
  );
  await must(
    "subjects",
    db.from("subjects").upsert([
      {
        id: IDS.fundamentals,
        semester_id: IDS.semester1,
        name: "Fundamentals of Nursing",
        description: "Core nursing skills for the ward.",
        display_order: 1,
        colour: "cobalt",
      },
      {
        id: IDS.microbiology,
        semester_id: IDS.semester1,
        name: "Microbiology",
        description: "Microbes, infection and how to stop it spreading.",
        display_order: 2,
        colour: "mint",
      },
      {
        id: IDS.communityHealth,
        semester_id: IDS.semester2,
        name: "Community Health Nursing",
        description: "Faculty test chapters live here, away from Semester 1 students.",
        display_order: 1,
        colour: "violet",
      },
    ]),
  );

  for (const chapter of CHAPTERS) {
    await must(
      `chapter ${chapter.title}`,
      db.from("chapters").upsert({
        id: chapter.id,
        subject_id: chapter.subjectId,
        title: chapter.title,
        summary_md: chapter.notes,
        display_order: chapter.order,
        status: chapter.status,
        created_at: CONTENT_DATE,
        updated_at: CONTENT_DATE,
      }),
    );
    const questionIds = chapter.questions.map((_, i) => questionId(chapter.id, i));
    const cardIds = chapter.cards.map((_, i) => cardId(chapter.id, i));
    // Anything else in a seeded chapter is left over from an earlier run.
    await must(
      "stray questions",
      db
        .from("questions")
        .delete()
        .eq("chapter_id", chapter.id)
        .not("id", "in", `(${questionIds.join(",")})`),
    );
    await must(
      "stray flashcards",
      db
        .from("flashcards")
        .delete()
        .eq("chapter_id", chapter.id)
        .not("id", "in", `(${cardIds.join(",")})`),
    );
    await must(
      "questions",
      db.from("questions").upsert(
        chapter.questions.map((q, i) => ({
          id: questionIds[i],
          chapter_id: chapter.id,
          prompt: q.prompt,
          options: q.options,
          correct_index: q.correct,
          explanation: q.explanation,
          difficulty: "medium",
          status: q.status ?? "approved",
          // Spaced a second apart so lists sort the same way every time.
          created_at: new Date(Date.parse(CONTENT_DATE) + i * 1000).toISOString(),
        })),
      ),
    );
    await must(
      "flashcards",
      db.from("flashcards").upsert(
        chapter.cards.map((c, i) => ({
          id: cardIds[i],
          chapter_id: chapter.id,
          front: c.front,
          back: c.back,
          hint: c.hint ?? null,
          card_type: "basic",
          status: c.status ?? "approved",
          created_at: new Date(Date.parse(CONTENT_DATE) + i * 1000).toISOString(),
        })),
      ),
    );
  }
  // Open reports would block approving and publishing.
  await must(
    "reports",
    db
      .from("content_reports")
      .delete()
      .in(
        "chapter_id",
        CHAPTERS.map((c) => c.id),
      ),
  );
}

async function findUserIds(match: { email?: string | null; phone?: string | null }) {
  const ids: string[] = [];
  const phone = match.phone?.replace(/^\+/, "");
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`[e2e] list users: ${error.message}`);
    for (const user of data.users) {
      if (
        (match.email && user.email?.toLowerCase() === match.email.toLowerCase()) ||
        (phone && user.phone?.replace(/^\+/, "") === phone)
      ) {
        ids.push(user.id);
      }
    }
    if (data.users.length < 1000) break;
  }
  return ids;
}

async function seedAccounts() {
  for (const account of Object.values(ACCOUNTS)) {
    // Start each run with a fresh account: no sessions, no progress.
    const stale = new Set([account.id, ...(await findUserIds(account))]);
    for (const id of stale) await admin().auth.admin.deleteUser(id);

    const { error } = await admin().auth.admin.createUser({
      id: account.id,
      email: account.email,
      ...(account.phone ? { phone: account.phone, phone_confirm: true } : {}),
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: account.name },
    });
    if (error) throw new Error(`[e2e] create ${account.email}: ${error.message}`);
    await must(
      `profile ${account.email}`,
      admin()
        .from("profiles")
        .update({
          role: account.role,
          batch_id: account.batch,
          student_type: account.role === "student" ? "internal" : null,
          display_name: account.name,
        })
        .eq("id", account.id),
    );
  }
}

export async function seed() {
  const env = e2eEnv();
  const started = Date.now();
  await seedCurriculum();
  await seedAccounts();
  await sanaWorld();
  await screenshotWorld();
  console.log(`[e2e] Seeded ${env.supabaseUrl} in ${Date.now() - started} ms`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
