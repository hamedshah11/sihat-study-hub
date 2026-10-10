import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNTS, E2E_PASSWORD } from "../fixtures/accounts.ts";
import { BATCH, MICRO_CH1, MICRO_CH2, flashcardId, questionId } from "../fixtures/curriculum.ts";
import { adminClient, studentClient } from "../support/admin.ts";
import { resetStudent } from "../support/scenarios.ts";
import { options } from "../support/study.ts";
import { expect, startAs, test } from "../support/test.ts";

// What a student could try from the browser's devtools: the app's own client
// (the public anon key plus their session) aimed at tables they must not
// write, rows they must not read, and answer keys they must not see early.

const A = ACCOUNTS.securityA;
const B = ACCOUNTS.securityB;

/** Written only by trusted server code; students may read their own rows. */
const READ_ONLY = {
  xp_events: {
    row: { user_id: A.id, amount: 1000, source: "quiz" },
    change: { amount: 1000 },
  },
  streaks: {
    row: { user_id: A.id, current_streak: 365, longest_streak: 365, freezes_available: 2 },
    change: { current_streak: 365 },
  },
  quiz_attempts: {
    row: { user_id: A.id, chapter_id: MICRO_CH1.id, score: 5, total_questions: 5 },
    change: { score: 5 },
  },
  chapter_progress: {
    row: { user_id: A.id, chapter_id: MICRO_CH1.id, attempts: 9, mastery_score: 100 },
    change: { mastery_score: 100 },
  },
  flashcard_reviews: {
    row: {
      user_id: A.id,
      flashcard_id: flashcardId(MICRO_CH1, 0),
      state: "review",
      stability: 9999,
      due_at: "2099-01-01T00:00:00Z",
    },
    change: { stability: 9999 },
  },
  tutor_messages: {
    row: { user_id: A.id, chapter_id: MICRO_CH1.id, role: "assistant", content: "Forged answer" },
    change: { content: "Forged answer" },
  },
  exam_attempts: {
    row: {
      user_id: A.id,
      subject_id: MICRO_CH1.subject_id,
      mode: "quick",
      chapter_ids: [MICRO_CH1.id],
      question_ids: [questionId(MICRO_CH1, 0)],
      total_questions: 1,
      duration_seconds: 600,
      expires_at: "2099-01-01T00:00:00Z",
      score: 100,
    },
    change: { score: 100 },
  },
  question_answers: {
    row: {
      user_id: A.id,
      question_id: questionId(MICRO_CH1, 0),
      chapter_id: MICRO_CH1.id,
      correct: true,
      source: "quiz",
    },
    change: { correct: true },
  },
} as const;
type Table = keyof typeof READ_ONLY;
const TABLES = Object.keys(READ_ONLY) as Table[];

/** Everything a student has in a table, read with the service role. */
async function rowsOf(table: Table, userId: string) {
  const { data, error } = await adminClient().from(table).select("*").eq("user_id", userId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return JSON.stringify((data ?? []).map((r) => JSON.stringify(r, Object.keys(r).sort())).sort());
}

let student: SupabaseClient;

test.beforeAll(async () => {
  await resetStudent("securityA");
  await resetStudent("securityB");
  // In case an earlier failed run left the profile changed.
  await adminClient()
    .from("profiles")
    .update({ display_name: A.name, role: "student", batch_id: BATCH.id, student_type: "internal" })
    .eq("id", A.id);
  student = await studentClient(A.email!, E2E_PASSWORD);
});

test.describe("progress tables are read-only from the browser", () => {
  for (const table of TABLES) {
    test(`${table}: insert, update and upsert all fail`, async () => {
      const before = await rowsOf(table, A.id);
      const { row, change } = READ_ONLY[table];

      const inserted = await student.from(table).insert(row).select();
      expect(inserted.error?.code, "insert").toBe("42501");

      // No update policy: the student's own rows are invisible to UPDATE.
      const updated = await student.from(table).update(change).eq("user_id", A.id).select();
      expect(updated.error === null ? updated.data : [], "update").toEqual([]);

      // Upsert onto an existing row (the conflict path) as well as a new one.
      const existing = await adminClient()
        .from(table)
        .select("*")
        .eq("user_id", A.id)
        .limit(1)
        .single();
      expect(existing.error).toBeNull();
      const upserted = await student
        .from(table)
        .upsert({ ...existing.data, ...change })
        .select();
      expect(upserted.error?.code, "upsert").toBe("42501");

      expect(await rowsOf(table, A.id), "rows after the attempts").toBe(before);
    });
  }
});

test("a student can't read another student's progress", async () => {
  for (const table of TABLES) {
    const theirs = await adminClient().from(table).select("user_id").eq("user_id", B.id);
    expect(theirs.data?.length, `${B.key} has ${table} rows`).toBeGreaterThan(0);

    const asked = await student.from(table).select("*").eq("user_id", B.id);
    expect(asked.error, table).toBeNull();
    expect(asked.data, table).toEqual([]);

    const everything = await student.from(table).select("user_id");
    expect(everything.error, table).toBeNull();
    expect(new Set(everything.data?.map((r) => r.user_id)), table).toEqual(new Set([A.id]));
  }
});

test("a student can't change their own role or batch", async () => {
  const { data: other } = await adminClient()
    .from("batches")
    .upsert({ id: "e2e00003-0000-4000-8000-0000000000ff", name: "Another batch" })
    .select("id")
    .single();

  const res = await student
    .from("profiles")
    .update({
      display_name: "Sadia Q.",
      role: "admin",
      batch_id: other!.id,
      student_type: "external",
    })
    .eq("id", A.id)
    .select("display_name, role, batch_id, student_type");
  expect(res.error).toBeNull();
  // The update itself is allowed (students edit their name), but
  // protect_profile_fields puts the protected columns back.
  expect(res.data).toEqual([
    { display_name: "Sadia Q.", role: "student", batch_id: BATCH.id, student_type: "internal" },
  ]);

  const { data: stored } = await adminClient()
    .from("profiles")
    .select("role, batch_id, student_type")
    .eq("id", A.id)
    .single();
  expect(stored).toEqual({ role: "student", batch_id: BATCH.id, student_type: "internal" });

  // Nor can they redeem a batch code without the server.
  const rpc = await student.rpc("redeem_invite_code", { p_code: "SIHAT-E2E-26", p_user_id: A.id });
  expect(rpc.error?.code).toBe("42501");

  await adminClient().from("profiles").update({ display_name: A.name }).eq("id", A.id);
});

test("question answer keys can't be read directly", async () => {
  for (const columns of ["correct_index", "explanation", "*", "id, correct_index"]) {
    const res = await student.from("questions").select(columns).eq("chapter_id", MICRO_CH1.id);
    expect(res.error?.code, columns).toBe("42501");
  }
  const allowed = await student
    .from("questions")
    .select("id, prompt, options")
    .eq("chapter_id", MICRO_CH1.id)
    .eq("status", "approved");
  expect(allowed.error).toBeNull();
  expect(allowed.data).toHaveLength(15);
});

test("a chapter quiz reaches the browser without answers until each one is locked", async ({
  page,
}) => {
  await startAs(page, "quiz");
  const explanations = MICRO_CH2.questions.map((q) => q.explanation);
  const traffic: { url: string; body: string; request: string; headers: Record<string, string> }[] =
    [];
  page.on("response", async (res) => {
    if (!res.url().includes("/_serverFn/")) return;
    traffic.push({
      url: res.url(),
      body: await res.text(),
      request: res.request().postData() ?? "",
      headers: await res.request().allHeaders(),
    });
  });

  await page.goto(`/chapters/${MICRO_CH2.id}?tab=quiz`);
  await expect(page.getByText("1 of 5")).toBeVisible();
  await page.waitForLoadState("networkidle");

  // The paper: prompts and options only.
  const paper = traffic.find((t) => t.body.includes('"quizId"'));
  expect(paper, "the quiz paper response").toBeDefined();
  for (const t of traffic) {
    expect(t.body).not.toMatch(/correct_?index|"explanation"/i);
    for (const e of explanations) expect(t.body).not.toContain(e);
  }

  // Answering locks the answer, and only then reveals that one question's key.
  const before = traffic.length;
  await options(page).first().click();
  await expect(page.getByText(/^(Not quite|That's right)\.$/)).toBeVisible();
  const check = traffic.slice(before).find((t) => t.body.includes('"correctIndex"'));
  expect(check, "the answer check response").toBeDefined();
  const revealed = explanations.filter((e) => check!.body.includes(e));
  expect(revealed).toHaveLength(1);

  // Sending a different answer for the same question afterwards changes nothing.
  const firstChoice = check!.request.match(/"selectedIndex"\]?.*?\{"t":0,"s":(\d)\}\]/)?.[1];
  expect(firstChoice).toBe("0");
  const replay = await page.request.post(check!.url, {
    headers: check!.headers,
    data: check!.request.replace(/\{"t":0,"s":0\}\]\},"o":0\}\]/, '{"t":0,"s":2}]},"o":0}]'),
  });
  expect(replay.ok()).toBe(true);
  const replayed = await replay.text();
  expect(replayed).toMatch(
    /"selectedIndex","correct","correctIndex","explanation"\],"v":\[\{"t":2,"s":2\},\{"t":0,"s":0\}/,
  );
});
