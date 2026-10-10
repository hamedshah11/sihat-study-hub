// Known progress states for the seeded students. Every timestamp is relative
// to "now", so the server (which uses the real clock) always sees the same
// picture: the same cards due, the same petal lengths, the same days in a row.

import { admin, ago, DAY, HOUR, must, reviewRow, wipeProgress } from "./admin.ts";
import { CHAPTERS, IDS, cardId, questionId } from "./seed-data.ts";

function chapter(id: string) {
  const found = CHAPTERS.find((c) => c.id === id);
  if (!found) throw new Error(`[e2e] unknown chapter ${id}`);
  return found;
}

/** The PKT study day (4 am to 4 am) a moment falls in, as YYYY-MM-DD. */
function studyDay(at: number) {
  return new Date(at + 5 * HOUR - 4 * HOUR).toISOString().slice(0, 10);
}

/**
 * Ayesha, the screenshot student: ten Vital signs cards due, Sterilisation
 * started with two quizzes, Hand hygiene untouched, four days in a row.
 */
export async function screenshotWorld(userId = IDS.screenshotStudent) {
  const now = Date.now();
  await wipeProgress(userId);
  const db = admin();

  const vital = chapter(IDS.vitalSigns);
  const sterilisation = chapter(IDS.sterilisation);
  const reviews = [
    // Due, oldest first, so the session's order is fixed. Due two days ago:
    // the screenshot tests hold the browser clock up to a day behind.
    ...vital.cards.slice(0, 10).map((_, i) =>
      reviewRow(userId, cardId(vital.id, i), {
        now,
        lastReviewAgo: 5 * DAY,
        dueIn: -(2 * DAY + (10 - i) * 60_000),
      }),
    ),
    ...sterilisation.cards.map((_, i) =>
      reviewRow(userId, cardId(sterilisation.id, i), {
        now,
        lastReviewAgo: 2 * DAY,
        dueIn: 5 * DAY,
        stability: 8,
      }),
    ),
  ];
  await must("reviews", db.from("flashcard_reviews").insert(reviews));

  await must(
    "quiz attempts",
    db.from("quiz_attempts").insert([
      {
        user_id: userId,
        chapter_id: sterilisation.id,
        score: 4,
        total_questions: 5,
        answers: [],
        attempted_at: ago(3 * DAY, now),
      },
      {
        user_id: userId,
        chapter_id: sterilisation.id,
        score: 4,
        total_questions: 5,
        answers: [],
        attempted_at: ago(2 * DAY, now),
      },
    ]),
  );
  await must(
    "chapter progress",
    db.from("chapter_progress").insert({
      user_id: userId,
      chapter_id: sterilisation.id,
      attempts: 2,
      mastery_score: 80,
      last_attempt_at: ago(2 * DAY, now),
      completed_at: ago(3 * DAY, now),
    }),
  );
  // Studied on each of the last four days. The batch's "reviews this week"
  // counts flashcard XP since Monday, so those six happen just now: the
  // total is the same whichever weekday the tests run.
  const xp = [
    ...[1, 2, 3, 4].map((d) => ({
      user_id: userId,
      amount: 10,
      source: "review",
      occurred_at: ago(d * DAY, now),
    })),
    ...[1, 2, 3, 4, 5, 6].map((s) => ({
      user_id: userId,
      amount: 1,
      source: "flashcard",
      occurred_at: ago(60_000 + s * 1000, now),
    })),
  ];
  await must("xp", db.from("xp_events").insert(xp));
  await must(
    "streak",
    db
      .from("streaks")
      .update({
        current_streak: 4,
        longest_streak: 6,
        last_active_date: studyDay(now - DAY),
        freezes_available: 1,
      })
      .eq("user_id", userId),
  );
}

/**
 * Sana, the seeded student: at least one row in every progress table, so the
 * security tests can check nobody else can read or change them.
 */
export async function sanaWorld(userId = IDS.student) {
  const now = Date.now();
  await wipeProgress(userId);
  const db = admin();
  const vital = chapter(IDS.vitalSigns);
  const hands = chapter(IDS.handHygiene);

  await must(
    "reviews",
    db.from("flashcard_reviews").insert(
      vital.cards.slice(0, 3).map((_, i) =>
        reviewRow(userId, cardId(vital.id, i), {
          now,
          lastReviewAgo: DAY,
          dueIn: 2 * DAY,
        }),
      ),
    ),
  );
  await must(
    "quiz attempt",
    db.from("quiz_attempts").insert({
      user_id: userId,
      chapter_id: hands.id,
      score: 3,
      total_questions: 5,
      answers: [],
      attempted_at: ago(DAY, now),
    }),
  );
  await must(
    "chapter progress",
    db.from("chapter_progress").insert({
      user_id: userId,
      chapter_id: hands.id,
      attempts: 1,
      mastery_score: 60,
      last_attempt_at: ago(DAY, now),
    }),
  );
  await must(
    "answers",
    db.from("question_answers").insert(
      hands.questions.map((q, i) => ({
        user_id: userId,
        question_id: questionId(hands.id, i),
        chapter_id: hands.id,
        correct: i < 3,
        source: "quiz",
        answered_at: ago(DAY, now),
      })),
    ),
  );
  await must(
    "xp",
    db.from("xp_events").insert([
      { user_id: userId, amount: 1, source: "flashcard", occurred_at: ago(DAY, now) },
      { user_id: userId, amount: 10, source: "quiz", occurred_at: ago(DAY, now) },
    ]),
  );
  await must(
    "streak",
    db
      .from("streaks")
      .update({ current_streak: 1, longest_streak: 3, last_active_date: studyDay(now - DAY) })
      .eq("user_id", userId),
  );
  await must(
    "tutor",
    db.from("tutor_messages").insert([
      {
        user_id: userId,
        chapter_id: vital.id,
        role: "user",
        content: "What is a normal pulse?",
        created_at: ago(DAY, now),
      },
      {
        user_id: userId,
        chapter_id: vital.id,
        role: "assistant",
        content: "A normal adult resting pulse is 60 to 100 beats a minute.\n\nSource: Pulse",
        created_at: ago(DAY, now),
      },
    ]),
  );
  await must(
    "exam",
    db.from("exam_attempts").insert({
      user_id: userId,
      subject_id: IDS.microbiology,
      mode: "quick",
      chapter_ids: [hands.id],
      question_ids: hands.questions.map((_, i) => questionId(hands.id, i)),
      duration_seconds: 600,
      started_at: ago(DAY + HOUR, now),
      expires_at: ago(DAY + HOUR - 600_000, now),
      submitted_at: ago(DAY, now),
      score: 3,
      total_questions: 5,
      answers: {},
      chapter_breakdown: [],
    }),
  );
}
