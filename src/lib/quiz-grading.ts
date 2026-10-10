// The rules submitQuiz (study.functions.ts) applies to a submission, kept
// pure so they can be unit-tested apart from the database reads and writes.

export type SubmittedAnswer = { questionId: string; selectedIndex: number };

/**
 * One answer per question (the first one sent). An answer already locked by
 * checkQuizAnswer wins over whatever the client sends now, so seeing the
 * correct option can't be used to change an answer.
 */
export function collectAnswers<T extends SubmittedAnswer>(
  answers: T[],
  locked: Record<string, number>,
): T[] {
  const seen = new Set<string>();
  return answers
    .filter((a) => {
      if (seen.has(a.questionId)) return false;
      seen.add(a.questionId);
      return true;
    })
    .map((a) =>
      typeof locked[a.questionId] === "number" ? { ...a, selectedIndex: locked[a.questionId] } : a,
    );
}

/** True when the answers are for exactly the questions on the issued paper. */
export function coversIssuedPaper(questionIds: string[], issuedIds: string[]): boolean {
  return (
    questionIds.length === issuedIds.length &&
    questionIds.every((questionId) => issuedIds.includes(questionId))
  );
}

export type AttemptScore = { score: number; total_questions: number };
export type DatedAttempt = AttemptScore & { attempted_at: string | null };

/**
 * XP per chapter per PKT day: the first attempt earns quiz XP (or pass XP if
 * it passes); a later attempt earns pass XP only if it is the first pass of
 * the day. `priorToday` is the chapter's earlier attempts today.
 */
export function quizXpSource(
  priorToday: AttemptScore[],
  passed: boolean,
): "quiz" | "quiz_pass" | null {
  const passedEarlierToday = priorToday.some(
    (a) => a.total_questions > 0 && a.score / a.total_questions >= 0.8,
  );
  if (priorToday.length === 0) return passed ? "quiz_pass" : "quiz";
  if (passed && !passedEarlierToday) return "quiz_pass";
  return null;
}

/**
 * Chapter mastery after an attempt: the average of the newest `window` quiz
 * scores, this attempt included, as a whole percentage. `prior` is the
 * chapter's most recent attempts read before this one was saved (at least
 * `window` of them, when there are that many); `attempt` is this one, or null
 * if saving it failed. `pct` is used when there is nothing to average.
 *
 * This gives the same answer as reading the newest `window` attempts back
 * after saving, without waiting for the save first.
 */
export function rollingMastery(
  prior: DatedAttempt[],
  attempt: DatedAttempt | null,
  pct: number,
  window: number,
): number {
  const recent = [...(attempt ? [attempt] : []), ...prior].sort(newestFirst).slice(0, window);
  const recentPcts = recent
    .filter((a) => a.total_questions > 0)
    .map((a) => a.score / a.total_questions);
  if (recentPcts.length === 0) recentPcts.push(pct);
  return Math.round((recentPcts.reduce((a, b) => a + b, 0) / recentPcts.length) * 100);
}

/** Newest first, as Postgres orders `attempted_at desc` (a missing time first). */
function newestFirst(a: DatedAttempt, b: DatedAttempt) {
  const time = (x: DatedAttempt) =>
    x.attempted_at === null ? Number.POSITIVE_INFINITY : Date.parse(x.attempted_at);
  const diff = time(b) - time(a);
  return Number.isNaN(diff) ? 0 : diff;
}
