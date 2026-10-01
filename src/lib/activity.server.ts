import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Shared XP + streak helpers for server functions (study.functions.ts,
// exam.functions.ts). Server-only: uses the service-role client.
//
// Server-controlled XP amounts. The client never gets to choose these.
// Mirrored in supabase/functions/_shared/activity.ts for edge functions.
export const XP_AMOUNTS = {
  flashcard: 1,
  quiz: 10,
  quiz_pass: 15,
  tutor: 2,
  exam: 20,
  exam_pass: 35,
  review: 10,
} as const;

export type XpSource = keyof typeof XP_AMOUNTS;

// Pakistan Standard Time is UTC+5 with no DST. Streaks roll over at PKT midnight.
export function pakistanDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ISO timestamp of the most recent PKT midnight. */
export function startOfTodayPkt(): string {
  return new Date(`${pakistanDate()}T00:00:00+05:00`).toISOString();
}

export async function recordActivity(
  userId: string,
  source: XpSource,
  idempotencyKey: string,
  awardXp = true,
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("record_activity", {
    p_user_id: userId,
    p_source: source,
    p_amount: XP_AMOUNTS[source],
    p_idempotency_key: idempotencyKey,
    p_award_xp: awardXp,
  });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

export type AnswerLogEntry = {
  questionId: string;
  chapterId: string | null;
  correct: boolean;
};

/**
 * Append answers to the per-question log (question_answers), which drives
 * quiz selection and "Fix your mistakes". Never throws: a logging failure
 * (e.g. the table not created yet) must not fail the quiz or exam submit.
 */
export async function logAnswers(
  userId: string,
  source: "quiz" | "exam" | "review",
  entries: AnswerLogEntry[],
  answeredAt: string = new Date().toISOString(),
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { error } = await supabaseAdmin.from("question_answers").insert(
      entries.map((e) => ({
        user_id: userId,
        question_id: e.questionId,
        chapter_id: e.chapterId,
        correct: e.correct,
        source,
        answered_at: answeredAt,
      })),
    );
    if (error) console.error("logAnswers failed", error.message);
  } catch (e) {
    console.error("logAnswers failed", e);
  }
}
