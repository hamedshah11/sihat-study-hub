// Mastery, version 1 (Florence brand book v2, "The product system").
//
// A subject's percentage combines two measures across the chapters the
// student has started:
//   - card recall (FSRS's estimated chance of recalling each card today,
//     averaged over every approved card in those chapters; a card never
//     reviewed counts as 0) weighted 60%, and
//   - quiz performance (the chapter's rolling average of its last three quiz
//     scores, chapter_progress.mastery_score; a started chapter with no quiz
//     yet counts as 0) weighted 40%.
// Chapters not started yet do not count against the student; coverage is
// shown separately ("4 of 9 chapters started"). The number can fall when
// reviews lapse.
//
// "In bloom" needs 80% AND evidence: at least two quizzes and two weeks of
// study in that subject. Until then an 80%+ subject shows "Growing".
//
// This is a first version to check against real review data before launch,
// not a validated measure of clinical competence. Pure functions only, so it
// can run on the server and in tests.

export const RECALL_WEIGHT = 0.6;
export const QUIZ_WEIGHT = 0.4;
export const NEEDS_LIGHT_BELOW = 0.4;
export const IN_BLOOM_FROM = 0.8;
export const BLOOM_MIN_QUIZZES = 2;
export const BLOOM_MIN_DAYS = 14;

export type PetalState = "not_started" | "needs_light" | "growing" | "in_bloom";

export type ChapterEvidence = {
  chapterId: string;
  /** Recall (0–1) for each approved card in the chapter; unreviewed = 0. */
  cardRecall: number[];
  /** How many of those cards have been reviewed at least once. */
  reviewedCards: number;
  /** Rolling quiz average 0–100 (chapter_progress.mastery_score), if any. */
  quizScore: number | null;
  quizAttempts: number;
  /** Earliest evidence of study in this chapter (ISO), if any. */
  firstActivityAt: string | null;
};

export type MasteryResult = {
  started: boolean;
  /** 0–1, or null when nothing has been started. */
  mastery: number | null;
  recall: number | null;
  quiz: number | null;
  state: PetalState;
};

function isStarted(c: ChapterEvidence) {
  return c.reviewedCards > 0 || c.quizAttempts > 0;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stateFor(
  mastery: number | null,
  evidence: { quizAttempts: number; firstActivityAt: string | null },
  now: Date = new Date(),
): PetalState {
  if (mastery === null) return "not_started";
  if (mastery < NEEDS_LIGHT_BELOW) return "needs_light";
  if (mastery < IN_BLOOM_FROM) return "growing";
  const days = evidence.firstActivityAt
    ? (now.getTime() - Date.parse(evidence.firstActivityAt)) / 86_400_000
    : 0;
  return evidence.quizAttempts >= BLOOM_MIN_QUIZZES && days >= BLOOM_MIN_DAYS
    ? "in_bloom"
    : "growing";
}

/** Mastery across a set of chapters (a subject, or a single chapter). */
export function computeMastery(chapters: ChapterEvidence[], now: Date = new Date()): MasteryResult {
  const started = chapters.filter(isStarted);
  if (started.length === 0) {
    return { started: false, mastery: null, recall: null, quiz: null, state: "not_started" };
  }
  const recall = mean(started.flatMap((c) => c.cardRecall));
  const quiz = mean(started.map((c) => (c.quizScore ?? 0) / 100)) ?? 0;
  // A chapter set with no flashcards at all is measured by quizzes alone.
  const mastery = recall === null ? quiz : RECALL_WEIGHT * recall + QUIZ_WEIGHT * quiz;
  const quizAttempts = started.reduce((n, c) => n + c.quizAttempts, 0);
  const firstActivityAt =
    started
      .map((c) => c.firstActivityAt)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null;
  return {
    started: true,
    mastery: clamp01(mastery),
    recall: recall === null ? null : clamp01(recall),
    quiz: clamp01(quiz),
    state: stateFor(clamp01(mastery), { quizAttempts, firstActivityAt }, now),
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function asPercent(mastery: number | null | undefined): number {
  return mastery == null ? 0 : Math.round(mastery * 100);
}

export const STATE_LABEL: Record<PetalState, string> = {
  not_started: "Not started",
  needs_light: "Needs light",
  growing: "Growing",
  in_bloom: "In bloom",
};

/** "6 cards, about 4 minutes": always honest about time. */
export function estimateMinutes(cards: number, quizzes = 0, notes = 0): number {
  const minutes = cards * 0.5 + quizzes * 3 + notes * 6;
  return Math.max(cards + quizzes + notes > 0 ? 2 : 0, Math.round(minutes));
}
