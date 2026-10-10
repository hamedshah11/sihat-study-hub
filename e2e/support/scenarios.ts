import { studyDay } from "../../src/lib/streak.ts";
import { ACCOUNTS, type Account, type AccountKey } from "../fixtures/accounts.ts";
import {
  ANAT_CH1,
  MICRO_CH1,
  VITALS_DRAFT,
  flashcardId,
  questionId,
  type ChapterSeed,
} from "../fixtures/curriculum.ts";
import { adminClient, must } from "./admin.ts";

// Each test starts from a known state for its own student: wipe their
// progress rows, then write the rows the journey needs. Times are relative to
// now, so "due" and "days in a row" always mean today.

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Every table a student's study activity writes to. */
export const PROGRESS_TABLES = [
  "flashcard_reviews",
  "quiz_attempts",
  "chapter_progress",
  "xp_events",
  "question_answers",
  "tutor_messages",
  "exam_attempts",
  "quiz_sessions",
  "user_badges",
  "content_reports",
  "student_settings",
  "study_circle_members",
] as const;

export async function resetProgress(userId: string) {
  const db = adminClient();
  for (const table of PROGRESS_TABLES) {
    await must(`reset ${table}`, db.from(table).delete().eq("user_id", userId));
  }
  await must(
    "reset streaks",
    db.from("streaks").upsert({
      user_id: userId,
      current_streak: 0,
      longest_streak: 0,
      last_active_date: null,
      freezes_available: 0,
    }),
  );
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Review rows for the first `count` cards of a chapter: reviewed `reviewedDaysAgo`
 * days ago, due `dueDaysAgo` days ago (negative = due in the future). Due
 * times are a minute apart so review order is fixed.
 */
function reviews(
  userId: string,
  chapter: ChapterSeed,
  count: number,
  opts: { reviewedDaysAgo: number; dueDaysAgo: number; from?: number; stability?: number },
) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const index = (opts.from ?? 0) + i;
    const due = iso(now - opts.dueDaysAgo * DAY + index * 60_000);
    return {
      user_id: userId,
      flashcard_id: flashcardId(chapter, index),
      reps: 3,
      lapses: 0,
      state: "review",
      stability: opts.stability ?? 3,
      difficulty: 5,
      scheduled_days: Math.max(1, Math.round(opts.reviewedDaysAgo - opts.dueDaysAgo)),
      elapsed_days: 2,
      learning_steps: 0,
      last_review: iso(now - opts.reviewedDaysAgo * DAY),
      due_at: due,
      next_review_at: due,
    };
  });
}

/** One xp_event (a study action) on each of the last `days` study days, ending `endDaysAgo` days ago. */
function studyDays(userId: string, days: number, endDaysAgo = 0) {
  const now = Date.now();
  return Array.from({ length: days }, (_, i) => ({
    user_id: userId,
    amount: 1,
    source: "flashcard",
    occurred_at: iso(now - (endDaysAgo + i) * DAY - HOUR),
  }));
}

function streak(userId: string, current: number, lastActiveDaysAgo: number) {
  return {
    user_id: userId,
    current_streak: current,
    longest_streak: current,
    last_active_date: studyDay(new Date(Date.now() - lastActiveDaysAgo * DAY)),
    freezes_available: 0,
  };
}

async function insert(table: string, rows: object | object[]) {
  await must(`seed ${table}`, adminClient().from(table).insert(rows));
}
async function upsert(table: string, rows: object | object[]) {
  await must(`seed ${table}`, adminClient().from(table).upsert(rows));
}

/** A returning student, so sign-in lands on Today rather than the first-day introduction. */
async function returning(user: Account) {
  await insert("xp_events", studyDays(user.id, 2, 1));
  await upsert("streaks", streak(user.id, 2, 1));
}

const SCENARIOS: Partial<Record<AccountKey, (user: Account) => Promise<void>>> = {
  /** A week into the semester: cards due in two subjects, two quizzes, one mistake to revisit. */
  async shots(user) {
    await insert("flashcard_reviews", [
      ...reviews(user.id, MICRO_CH1, 8, { reviewedDaysAgo: 5, dueDaysAgo: 2, stability: 30 }),
      ...reviews(user.id, MICRO_CH1, 4, {
        reviewedDaysAgo: 1,
        dueDaysAgo: -6,
        from: 8,
        stability: 30,
      }),
      // Due half a day before the Microbiology cards, so the review order has no ties.
      ...reviews(user.id, ANAT_CH1, 2, { reviewedDaysAgo: 5, dueDaysAgo: 2.5, stability: 30 }),
      ...reviews(user.id, ANAT_CH1, 3, {
        reviewedDaysAgo: 2,
        dueDaysAgo: -4,
        from: 2,
        stability: 30,
      }),
    ]);
    const now = Date.now();
    await insert("quiz_attempts", [
      {
        user_id: user.id,
        chapter_id: MICRO_CH1.id,
        score: 3,
        total_questions: 5,
        attempted_at: iso(now - 4 * DAY),
      },
      {
        user_id: user.id,
        chapter_id: MICRO_CH1.id,
        score: 4,
        total_questions: 5,
        attempted_at: iso(now - 2 * DAY),
      },
    ]);
    await upsert("chapter_progress", {
      user_id: user.id,
      chapter_id: MICRO_CH1.id,
      attempts: 2,
      mastery_score: 70,
      last_attempt_at: iso(now - 2 * DAY),
    });
    await insert("question_answers", {
      user_id: user.id,
      question_id: questionId(MICRO_CH1, 5),
      chapter_id: MICRO_CH1.id,
      correct: false,
      source: "quiz",
      answered_at: iso(now - 2 * DAY),
    });
    await insert("xp_events", studyDays(user.id, 6, 0));
    await upsert("streaks", streak(user.id, 6, 0));
  },

  /** Ten cards due, studied yesterday and the three days before. */
  async review(user) {
    await insert(
      "flashcard_reviews",
      reviews(user.id, MICRO_CH1, 10, { reviewedDaysAgo: 4, dueDaysAgo: 1 }),
    );
    await insert("xp_events", studyDays(user.id, 4, 1));
    await upsert("streaks", streak(user.id, 4, 1));
  },

  signIn: returning,
  phone: returning,
  quiz: returning,
  mistakes: returning,
  tutor: returning,
  theme: returning,

  /** Rows in every read-only progress table, for the security tests. */
  async securityA(user) {
    await progressInEveryTable(user);
  },
  async securityB(user) {
    await progressInEveryTable(user);
  },
};

async function progressInEveryTable(user: Account) {
  const now = Date.now();
  await insert(
    "flashcard_reviews",
    reviews(user.id, MICRO_CH1, 2, { reviewedDaysAgo: 2, dueDaysAgo: 1 }),
  );
  await insert("quiz_attempts", {
    user_id: user.id,
    chapter_id: MICRO_CH1.id,
    score: 2,
    total_questions: 5,
    attempted_at: iso(now - DAY),
  });
  await upsert("chapter_progress", {
    user_id: user.id,
    chapter_id: MICRO_CH1.id,
    attempts: 1,
    mastery_score: 40,
    last_attempt_at: iso(now - DAY),
  });
  await insert("xp_events", studyDays(user.id, 1, 1));
  await upsert("streaks", streak(user.id, 1, 1));
  await insert("tutor_messages", {
    user_id: user.id,
    chapter_id: MICRO_CH1.id,
    role: "user",
    content: "What are the five moments for hand hygiene?",
  });
  await insert("question_answers", {
    user_id: user.id,
    question_id: questionId(MICRO_CH1, 0),
    chapter_id: MICRO_CH1.id,
    correct: false,
    source: "quiz",
    answered_at: iso(now - DAY),
  });
  await insert("exam_attempts", {
    user_id: user.id,
    subject_id: MICRO_CH1.subject_id,
    mode: "quick",
    chapter_ids: [MICRO_CH1.id],
    question_ids: [questionId(MICRO_CH1, 0)],
    total_questions: 1,
    duration_seconds: 600,
    started_at: iso(now - DAY),
    expires_at: iso(now - DAY + 600_000),
    submitted_at: iso(now - DAY + 300_000),
    score: 0,
  });
}

/** Wipe a student's progress and give them the starting state their tests expect. */
export async function resetStudent(key: AccountKey) {
  const user = ACCOUNTS[key];
  await resetProgress(user.id);
  await SCENARIOS[key]?.(user);
}

/** Put the faculty draft chapter back as seeded: 13 approved, 5 drafts, unpublished. */
export async function resetDraftChapter() {
  const db = adminClient();
  await must(
    "reset draft questions",
    db.from("questions").upsert(
      VITALS_DRAFT.questions.map((q, i) => ({
        id: questionId(VITALS_DRAFT, i),
        chapter_id: VITALS_DRAFT.id,
        prompt: q.prompt,
        options: q.options,
        correct_index: q.correct,
        explanation: q.explanation,
        difficulty: q.difficulty ?? "medium",
        status: q.status ?? "approved",
      })),
    ),
  );
  await must(
    "reset draft chapter",
    db.from("chapters").update({ status: "draft" }).eq("id", VITALS_DRAFT.id),
  );
  await must(
    "clear draft reports",
    db.from("content_reports").delete().eq("chapter_id", VITALS_DRAFT.id),
  );
}

/** Move a student's answer log back in time, as if `days` had passed since they answered. */
export async function ageAnswers(userId: string, days: number) {
  const db = adminClient();
  const rows = await must(
    "read answers",
    db.from("question_answers").select("id, answered_at").eq("user_id", userId),
  );
  for (const row of rows as { id: string; answered_at: string }[]) {
    await must(
      "age answer",
      db
        .from("question_answers")
        .update({ answered_at: iso(Date.parse(row.answered_at) - days * DAY) })
        .eq("id", row.id),
    );
  }
}
