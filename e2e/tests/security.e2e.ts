// Security regressions, checked the way an attacker would try them: with the
// app's public anon key and a real student session, exactly what devtools on
// a student's phone has. (CLAUDE.md, "Security model".)

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  admin,
  anonClient,
  createStudent,
  deleteUser,
  must,
  PROGRESS_TABLES,
  reviewRow,
  signIn,
  DAY,
  type TestUser,
} from "../support/admin.ts";
import { expect, loginAs, test } from "../support/fixtures.ts";
import {
  ACCOUNTS,
  HAND_HYGIENE_QUESTIONS,
  IDS,
  VITAL_SIGNS_QUESTIONS,
  cardId,
  questionId,
} from "../support/seed-data.ts";

type Table = (typeof PROGRESS_TABLES)[number];

/** A forged row for each table: the kind of thing a student would want to fake. */
function forged(table: Table, userId: string): Record<string, unknown> {
  const now = new Date().toISOString();
  switch (table) {
    case "xp_events":
      return { user_id: userId, amount: 100_000, source: "quiz_pass", occurred_at: now };
    case "streaks":
      return {
        user_id: userId,
        current_streak: 365,
        longest_streak: 365,
        last_active_date: now.slice(0, 10),
      };
    case "quiz_attempts":
      return {
        user_id: userId,
        chapter_id: IDS.vitalSigns,
        score: 5,
        total_questions: 5,
        answers: [],
      };
    case "chapter_progress":
      return { user_id: userId, chapter_id: IDS.vitalSigns, mastery_score: 100, attempts: 9 };
    case "flashcard_reviews":
      return reviewRow(userId, cardId(IDS.vitalSigns, 0), {
        lastReviewAgo: 0,
        dueIn: 365 * DAY,
        stability: 999,
      });
    case "tutor_messages":
      return {
        user_id: userId,
        chapter_id: IDS.vitalSigns,
        role: "assistant",
        content: "Forged answer",
      };
    case "exam_attempts":
      return {
        user_id: userId,
        subject_id: IDS.fundamentals,
        mode: "quick",
        chapter_ids: [IDS.vitalSigns],
        question_ids: [questionId(IDS.vitalSigns, 0)],
        duration_seconds: 60,
        expires_at: now,
        submitted_at: now,
        score: 1,
        total_questions: 1,
      };
    case "question_answers":
      return {
        user_id: userId,
        question_id: questionId(IDS.vitalSigns, 0),
        chapter_id: IDS.vitalSigns,
        correct: true,
        source: "quiz",
      };
  }
}

/** A harmless-looking change to an existing row of each table. */
const tamper: Record<Table, Record<string, unknown>> = {
  xp_events: { amount: 100_000 },
  streaks: { current_streak: 365, longest_streak: 365 },
  quiz_attempts: { score: 5 },
  chapter_progress: { mastery_score: 100 },
  flashcard_reviews: { stability: 999, due_at: "2099-01-01T00:00:00Z" },
  tutor_messages: { content: "Edited answer" },
  exam_attempts: { score: 99 },
  question_answers: { correct: true },
};

const conflictKey: Record<Table, string> = {
  xp_events: "id",
  streaks: "user_id",
  quiz_attempts: "id",
  chapter_progress: "user_id,chapter_id",
  flashcard_reviews: "user_id,flashcard_id",
  tutor_messages: "id",
  exam_attempts: "id",
  question_answers: "id",
};

/** Everything the service role can see of a user's rows in a table. */
async function snapshot(table: Table, userId: string) {
  const rows = await must(`read ${table}`, admin().from(table).select("*").eq("user_id", userId));
  return JSON.stringify((rows as Record<string, unknown>[]).map((r) => JSON.stringify(r)).sort());
}

let attacker: TestUser;
let client: SupabaseClient;

test.describe("progress tables are read-only from the browser", () => {
  test.beforeAll(async () => {
    attacker = await createStudent({ name: "Mallory Shah", batchId: IDS.batchA });
    // Give the attacker a real row in every table, so updates and deletes have
    // a target and can't pass just because nothing matched.
    for (const table of PROGRESS_TABLES) {
      if (table === "streaks") continue; // made on sign-up
      const row = forged(table, attacker.id);
      if (table === "xp_events") row.amount = 1;
      if (table === "quiz_attempts") row.score = 1;
      if (table === "chapter_progress") row.mastery_score = 20;
      if (table === "flashcard_reviews") Object.assign(row, { stability: 3 });
      if (table === "tutor_messages") row.content = "A real answer";
      await must(`own ${table}`, admin().from(table).insert(row));
    }
    ({ client } = await signIn(attacker.email));
  });

  test.afterAll(async () => {
    await deleteUser(attacker.id);
  });

  for (const table of PROGRESS_TABLES) {
    test(`${table}: insert, update, upsert and delete all fail`, async () => {
      const before = await snapshot(table, attacker.id);

      const insert = await client.from(table).insert(forged(table, attacker.id)).select();
      expect(insert.error?.code, `insert into ${table}`).toBe("42501");

      const update = await client
        .from(table)
        .update(tamper[table])
        .eq("user_id", attacker.id)
        .select();
      expect(update.error?.code === "42501" || update.data?.length === 0, `update ${table}`).toBe(
        true,
      );

      const { data: existing } = await admin()
        .from(table)
        .select("*")
        .eq("user_id", attacker.id)
        .limit(1);
      const upsert = await client
        .from(table)
        .upsert({ ...existing![0], ...tamper[table] }, { onConflict: conflictKey[table] })
        .select();
      expect(upsert.error?.code, `upsert into ${table}`).toBe("42501");

      const remove = await client.from(table).delete().eq("user_id", attacker.id).select();
      expect(
        remove.error?.code === "42501" || remove.data?.length === 0,
        `delete from ${table}`,
      ).toBe(true);

      // Nothing changed, as far as the database is concerned.
      expect(await snapshot(table, attacker.id)).toBe(before);
    });

    test(`${table}: another student's rows stay hidden`, async () => {
      const theirs = await client.from(table).select("*").eq("user_id", ACCOUNTS.student.id);
      expect(theirs.error).toBeNull();
      expect(theirs.data).toEqual([]);

      const everything = await client.from(table).select("user_id");
      expect(everything.error).toBeNull();
      expect(everything.data!.length).toBeGreaterThan(0);
      expect(new Set(everything.data!.map((r) => r.user_id))).toEqual(new Set([attacker.id]));

      // ...and they really are there.
      const { count } = await admin()
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("user_id", ACCOUNTS.student.id);
      expect(count).toBeGreaterThan(0);
    });
  }
});

test("a student can't change their own role or batch", async () => {
  const student = await createStudent({ name: "Hira Khan", batchId: IDS.batchA });
  try {
    const { client } = await signIn(student.email);
    const { error } = await client
      .from("profiles")
      .update({
        role: "admin",
        batch_id: IDS.batchB,
        student_type: "external",
        email: "someone-else@florence.test",
        display_name: "Hira K.",
      })
      .eq("id", student.id);
    expect(error).toBeNull();

    const { data: profile } = await admin()
      .from("profiles")
      .select("role, batch_id, student_type, email, display_name")
      .eq("id", student.id)
      .single();
    // The ordinary field changed; the protected ones were put back.
    expect(profile).toEqual({
      role: "student",
      batch_id: IDS.batchA,
      student_type: "internal",
      email: student.email,
      display_name: "Hira K.",
    });

    // Another student's profile can't be touched at all.
    const other = await client
      .from("profiles")
      .update({ display_name: "Changed" })
      .eq("id", ACCOUNTS.student.id)
      .select();
    expect(other.data).toEqual([]);
    const { data: sana } = await admin()
      .from("profiles")
      .select("display_name")
      .eq("id", ACCOUNTS.student.id)
      .single();
    expect(sana?.display_name).toBe(ACCOUNTS.student.name);
  } finally {
    await deleteUser(student.id);
  }
});

test("answer keys never reach the browser through the database API", async () => {
  const student = await createStudent();
  try {
    const { client } = await signIn(student.email);
    for (const columns of ["correct_index", "explanation", "*", "id, prompt, correct_index"]) {
      const { data, error } = await client.from("questions").select(columns).limit(1);
      expect(error?.code, `select ${columns}`).toBe("42501");
      expect(data).toBeNull();
    }
    const { data: allowed, error } = await client
      .from("questions")
      .select("id, prompt, options")
      .eq("chapter_id", IDS.vitalSigns);
    expect(error).toBeNull();
    expect(allowed).toHaveLength(VITAL_SIGNS_QUESTIONS.length);

    // Signed out, nothing at all.
    const { data: anon } = await anonClient().from("questions").select("id, prompt").limit(5);
    expect(anon).toEqual([]);
  } finally {
    await deleteUser(student.id);
  }
});

test("a chapter quiz reaches the browser without answers until each one is locked", async ({
  page,
  student,
}) => {
  const bodies: { url: string; body: string }[] = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/_serverFn/")) return;
    bodies.push({ url: res.url(), body: await res.text().catch(() => "") });
  });
  const explanations = HAND_HYGIENE_QUESTIONS.map((q) => q.explanation);

  await loginAs(page, student);
  await page.goto(`/chapters/${IDS.handHygiene}?tab=quiz`);
  await expect(page.getByText("1 of 5")).toBeVisible();
  const firstPrompt = (await page.getByRole("heading", { level: 2 }).textContent())!.trim();
  const first = HAND_HYGIENE_QUESTIONS.find((q) => q.prompt === firstPrompt)!;

  const issued = bodies.find((b) => b.body.includes(firstPrompt));
  expect(issued, "the quiz paper came from a server function").toBeTruthy();
  for (const { body } of bodies) {
    expect(body).not.toMatch(/correct_?index|explanation/i);
    for (const text of explanations) expect(body).not.toContain(text);
  }

  // Answering locks that one question, and only its explanation comes back.
  const seen = bodies.length;
  await page.getByRole("radiogroup", { name: "Answer options" }).getByRole("radio").first().click();
  await expect(page.getByText(first.explanation)).toBeVisible();
  const after = bodies
    .slice(seen)
    .map((b) => b.body)
    .join("\n");
  expect(after).toContain(first.explanation);
  for (const text of explanations.filter((t) => t !== first.explanation)) {
    expect(after).not.toContain(text);
  }

  // The lock is real: the server kept the first choice.
  const { data: session } = await admin()
    .from("quiz_sessions")
    .select("locked_answers")
    .eq("user_id", student.id)
    .single();
  expect(Object.values(session?.locked_answers ?? {})).toEqual([0]);
});
