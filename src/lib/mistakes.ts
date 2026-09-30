// Mistake scheduling and quiz question selection, from the per-question answer
// log (question_answers). Pure functions: safe in browser and server code.
//
// Mistake rules:
//   - Answer a question wrong  -> it comes back 1 day later.
//   - Answer it right once     -> it comes back once more 3 days later.
//   - Answer it right twice    -> cleared.
//   - Get it wrong again at any point and the cycle restarts.

export const MISTAKE_FIRST_GAP_DAYS = 1;
export const MISTAKE_SECOND_GAP_DAYS = 3;
export const MISTAKE_CLEAR_AFTER = 2;

const DAY_MS = 86_400_000;

export type AnswerRecord = {
  question_id: string;
  chapter_id: string | null;
  correct: boolean;
  answered_at: string;
};

export type QuestionHistory = {
  questionId: string;
  chapterId: string | null;
  lastSeenAt: number;
  /** When a mistake is next due, or null if this question isn't a mistake. */
  mistakeDueAt: number | null;
  /** Right answers since the most recent wrong one (0 or 1 while active). */
  rightSinceWrong: number;
};

/** Collapse the answer log into one entry per question. */
export function buildHistory(answers: AnswerRecord[]): Map<string, QuestionHistory> {
  const byQuestion = new Map<string, AnswerRecord[]>();
  for (const a of answers) {
    const list = byQuestion.get(a.question_id) ?? [];
    list.push(a);
    byQuestion.set(a.question_id, list);
  }

  const out = new Map<string, QuestionHistory>();
  for (const [questionId, list] of byQuestion) {
    list.sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at));
    const last = list[list.length - 1];
    let lastWrongIdx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].correct) {
        lastWrongIdx = i;
        break;
      }
    }

    let mistakeDueAt: number | null = null;
    let rightSinceWrong = 0;
    if (lastWrongIdx >= 0) {
      const after = list.slice(lastWrongIdx + 1);
      rightSinceWrong = after.length; // everything after the last wrong is right
      if (rightSinceWrong === 0) {
        mistakeDueAt = Date.parse(list[lastWrongIdx].answered_at) + MISTAKE_FIRST_GAP_DAYS * DAY_MS;
      } else if (rightSinceWrong < MISTAKE_CLEAR_AFTER) {
        mistakeDueAt =
          Date.parse(after[after.length - 1].answered_at) + MISTAKE_SECOND_GAP_DAYS * DAY_MS;
      }
    }

    out.set(questionId, {
      questionId,
      chapterId: last.chapter_id,
      lastSeenAt: Date.parse(last.answered_at),
      mistakeDueAt,
      rightSinceWrong,
    });
  }
  return out;
}

/** Mistakes that are due now, most overdue first. */
export function dueMistakes(
  history: Map<string, QuestionHistory>,
  now = Date.now(),
): QuestionHistory[] {
  return [...history.values()]
    .filter((h) => h.mistakeDueAt !== null && h.mistakeDueAt <= now)
    .sort((a, b) => a.mistakeDueAt! - b.mistakeDueAt!);
}

/** Mistakes not due yet (for "coming back later" counts). */
export function pendingMistakes(history: Map<string, QuestionHistory>, now = Date.now()): number {
  let n = 0;
  for (const h of history.values()) if (h.mistakeDueAt !== null && h.mistakeDueAt > now) n++;
  return n;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Choose `size` questions for a chapter quiz:
 *   1. mistakes due now (at most half the quiz, so it still feels fresh),
 *   2. questions never answered,
 *   3. questions answered right longest ago,
 *   4. anything left (e.g. mistakes not due yet), to fill the quiz.
 * The final order is shuffled.
 */
export function pickQuizQuestions<T extends { id: string }>(
  questions: T[],
  history: Map<string, QuestionHistory>,
  size: number,
  now = Date.now(),
  rand: () => number = Math.random,
): T[] {
  const due: T[] = [];
  const unseen: T[] = [];
  const seen: { q: T; at: number }[] = [];
  const notDue: T[] = [];
  for (const q of questions) {
    const h = history.get(q.id);
    if (!h) unseen.push(q);
    else if (h.mistakeDueAt !== null && h.mistakeDueAt <= now) due.push(q);
    else if (h.mistakeDueAt !== null) notDue.push(q);
    else seen.push({ q, at: h.lastSeenAt });
  }

  const picked: T[] = [];
  const take = (list: T[], max: number) => {
    for (const q of list) {
      if (picked.length >= size || max <= 0) break;
      picked.push(q);
      max--;
    }
  };
  const dueSorted = due.sort(
    (a, b) => history.get(a.id)!.mistakeDueAt! - history.get(b.id)!.mistakeDueAt!,
  );
  take(dueSorted, Math.ceil(size / 2));
  take(shuffle(unseen, rand), size);
  // Oldest first, with a little shuffling among equals so retakes vary.
  take(
    shuffle(seen, rand)
      .sort((a, b) => a.at - b.at)
      .map((s) => s.q),
    size,
  );
  take(
    dueSorted.filter((q) => !picked.includes(q)),
    size,
  );
  take(shuffle(notDue, rand), size);
  return shuffle(picked, rand);
}
