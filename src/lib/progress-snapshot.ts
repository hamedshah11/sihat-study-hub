// Builds the student's progress snapshot (Today, Subjects, Progress and the
// session-complete screen all read from it) out of raw rows. Pure: the data
// loading lives in progress.functions.ts, so this can be unit-tested.

import {
  computeMastery,
  estimateMinutes,
  type ChapterEvidence,
  type PetalState,
} from "@/lib/mastery";
import { retrievability, type ReviewState } from "@/lib/spacedRepetition";
import { displayStreak, studyDay, type StreakRow } from "@/lib/streak";

export const QUIZ_MIN_QUESTIONS = 5;

export type RawSubject = {
  id: string;
  name: string;
  colour: string | null;
  display_order: number | null;
};
export type RawChapter = {
  id: string;
  title: string;
  subject_id: string;
  display_order: number | null;
};
export type RawReview = Partial<ReviewState> & { flashcard_id: string };
export type RawProgress = {
  chapter_id: string;
  mastery_score: number | null;
  attempts: number | null;
  last_attempt_at: string | null;
};
export type RawQuizAttempt = { chapter_id: string; attempted_at: string };

export type ChapterAction =
  | { kind: "cards"; label: string; count: number }
  | { kind: "quiz"; label: string }
  | { kind: "notes"; label: string }
  | { kind: "none"; label: string };

export type ChapterSnapshot = {
  id: string;
  title: string;
  order: number;
  started: boolean;
  mastery: number | null;
  percent: number;
  state: PetalState;
  cardsTotal: number;
  cardsDue: number;
  cardsNew: number;
  quizAvailable: boolean;
  quizAttempts: number;
  action: ChapterAction;
};

export type SubjectSnapshot = {
  id: string;
  name: string;
  colour: string | null;
  index: number;
  mastery: number | null;
  percent: number;
  state: PetalState;
  chaptersStarted: number;
  chaptersTotal: number;
  cardsDue: number;
  chapters: ChapterSnapshot[];
};

export type SessionPlan = {
  /** Cards due today across the semester. */
  cardsDue: number;
  /** Subjects with cards due, most first (for "Microbiology and Anatomy"). */
  dueSubjects: { id: string; name: string; count: number }[];
  /** The chapter with the most cards due: where "Start review" goes first. */
  reviewChapterId: string | null;
  /** A chapter whose quiz is the next useful thing, if any. */
  quizChapterId: string | null;
  quizCount: number;
  /** The first chapter not started yet, in teaching order. */
  nextChapter: { id: string; title: string; subjectName: string } | null;
  /** When nothing is due: fresh cards to learn next (first day included). */
  newCards: {
    chapterId: string;
    title: string;
    subjectName: string;
    order: number;
    count: number;
  } | null;
  minutes: number;
};

/** Fresh cards introduced in one session when nothing is due. */
export const NEW_CARDS_PER_SESSION = 8;
/** Due cards in one review session. */
export const REVIEW_SESSION_SIZE = 20;

export type WeekDay = { date: string; label: string; studied: boolean; isToday: boolean };

export type ProgressSnapshot = {
  subjects: SubjectSnapshot[];
  plan: SessionPlan;
  daysInRow: number;
  daysStudied: number;
  week: WeekDay[];
  chaptersStarted: number;
  chaptersTotal: number;
  /** True until the student has done anything at all. */
  firstDay: boolean;
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function chapterAction(c: {
  started: boolean;
  cardsDue: number;
  quizAvailable: boolean;
  quizAttempts: number;
  state: PetalState;
}): ChapterAction {
  if (!c.started) return { kind: "notes", label: "Read notes" };
  if (c.cardsDue > 0)
    return { kind: "cards", label: `${plural(c.cardsDue, "card")} due`, count: c.cardsDue };
  if (c.quizAvailable && (c.quizAttempts === 0 || c.state === "needs_light")) {
    return { kind: "quiz", label: "Take quiz" };
  }
  return { kind: "none", label: "Nothing due" };
}

const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** Monday-to-Sunday study days of the current week, oldest first. */
export function studyWeek(activityDays: Set<string>, today = studyDay()): WeekDay[] {
  const todayDate = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (todayDate.getUTCDay() + 6) % 7;
  return WEEK_LABELS.map((label, i) => {
    const d = new Date(todayDate.getTime() + (i - mondayOffset) * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    return { date, label, studied: activityDays.has(date), isToday: date === today };
  });
}

export function buildSnapshot(input: {
  subjects: RawSubject[];
  chapters: RawChapter[];
  cards: { id: string; chapter_id: string }[];
  questionCounts: Map<string, number>;
  reviews: RawReview[];
  progress: RawProgress[];
  quizAttempts: RawQuizAttempt[];
  streak: Partial<StreakRow> | null;
  /** Timestamps of every study action (xp_events.occurred_at). */
  activityAt: string[];
  now?: Date;
}): ProgressSnapshot {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const reviewByCard = new Map(input.reviews.map((r) => [r.flashcard_id, r]));
  const progressByChapter = new Map(input.progress.map((p) => [p.chapter_id, p]));
  const firstQuizByChapter = new Map<string, string>();
  for (const a of input.quizAttempts) {
    const prev = firstQuizByChapter.get(a.chapter_id);
    if (!prev || a.attempted_at < prev) firstQuizByChapter.set(a.chapter_id, a.attempted_at);
  }
  const cardsByChapter = new Map<string, string[]>();
  for (const c of input.cards) {
    const list = cardsByChapter.get(c.chapter_id) ?? [];
    list.push(c.id);
    cardsByChapter.set(c.chapter_id, list);
  }

  const subjects = [...input.subjects]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((subject, index): SubjectSnapshot => {
      const chapters = input.chapters
        .filter((c) => c.subject_id === subject.id)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const evidence: ChapterEvidence[] = [];
      const chapterSnapshots = chapters.map((chapter, i): ChapterSnapshot => {
        const cardIds = cardsByChapter.get(chapter.id) ?? [];
        let reviewed = 0;
        let due = 0;
        let earliestReview: string | null = null;
        const recall = cardIds.map((id) => {
          const r = reviewByCard.get(id);
          if (!r || !r.last_review) return 0;
          reviewed += 1;
          if (!r.due_at || Date.parse(r.due_at) <= nowMs) due += 1;
          if (!earliestReview || r.last_review < earliestReview) earliestReview = r.last_review;
          return retrievability(r, now);
        });
        const progress = progressByChapter.get(chapter.id);
        const quizAttempts = progress?.attempts ?? 0;
        const firstQuiz = firstQuizByChapter.get(chapter.id) ?? null;
        const firstActivityAt =
          [earliestReview, firstQuiz].filter((d): d is string => Boolean(d)).sort()[0] ?? null;
        const ev: ChapterEvidence = {
          chapterId: chapter.id,
          cardRecall: recall,
          reviewedCards: reviewed,
          quizScore: progress?.mastery_score == null ? null : Number(progress.mastery_score),
          quizAttempts,
          firstActivityAt,
        };
        evidence.push(ev);
        const m = computeMastery([ev], now);
        const quizAvailable = (input.questionCounts.get(chapter.id) ?? 0) >= QUIZ_MIN_QUESTIONS;
        const base = {
          started: m.started,
          cardsDue: due,
          quizAvailable,
          quizAttempts,
          state: m.state,
        };
        return {
          id: chapter.id,
          title: chapter.title,
          order: chapter.display_order ?? i + 1,
          started: m.started,
          mastery: m.mastery,
          percent: m.mastery == null ? 0 : Math.round(m.mastery * 100),
          state: m.state,
          cardsTotal: cardIds.length,
          cardsDue: due,
          cardsNew: cardIds.length - reviewed,
          quizAvailable,
          quizAttempts,
          action: chapterAction(base),
        };
      });
      const m = computeMastery(evidence, now);
      return {
        id: subject.id,
        name: subject.name,
        colour: subject.colour,
        index,
        mastery: m.mastery,
        percent: m.mastery == null ? 0 : Math.round(m.mastery * 100),
        state: m.state,
        chaptersStarted: chapterSnapshots.filter((c) => c.started).length,
        chaptersTotal: chapterSnapshots.length,
        cardsDue: chapterSnapshots.reduce((n, c) => n + c.cardsDue, 0),
        chapters: chapterSnapshots,
      };
    });

  // --- Today's session ------------------------------------------------------
  const allChapters = subjects.flatMap((s) => s.chapters.map((c) => ({ ...c, subject: s })));
  const dueSubjects = subjects
    .filter((s) => s.cardsDue > 0)
    .map((s) => ({ id: s.id, name: s.name, count: s.cardsDue }))
    .sort((a, b) => b.count - a.count);
  const reviewChapter = [...allChapters].sort((a, b) => b.cardsDue - a.cardsDue)[0];
  const quizChapters = allChapters.filter((c) => c.action.kind === "quiz");
  const next = allChapters.find((c) => !c.started);
  const cardsDue = dueSubjects.reduce((n, s) => n + s.count, 0);
  const quizCount = quizChapters.length > 0 ? 1 : 0;
  // Keep learning the chapter already under way before opening a new one.
  const learning =
    allChapters.find((c) => c.started && c.cardsNew > 0) ??
    allChapters.find((c) => !c.started && c.cardsNew > 0);
  const newCards =
    cardsDue === 0 && learning
      ? {
          chapterId: learning.id,
          title: learning.title,
          subjectName: learning.subject.name,
          order: learning.order,
          count: Math.min(NEW_CARDS_PER_SESSION, learning.cardsNew),
        }
      : null;
  const sessionCards =
    cardsDue > 0 ? Math.min(cardsDue, REVIEW_SESSION_SIZE) : (newCards?.count ?? 0);
  const plan: SessionPlan = {
    cardsDue,
    dueSubjects,
    reviewChapterId: reviewChapter && reviewChapter.cardsDue > 0 ? reviewChapter.id : null,
    quizChapterId: quizChapters[0]?.id ?? null,
    quizCount,
    nextChapter: next ? { id: next.id, title: next.title, subjectName: next.subject.name } : null,
    newCards,
    minutes: estimateMinutes(sessionCards, quizCount),
  };

  const activityDays = new Set(input.activityAt.map((t) => studyDay(new Date(t))));
  const chaptersStarted = subjects.reduce((n, s) => n + s.chaptersStarted, 0);

  return {
    subjects,
    plan,
    daysInRow: displayStreak(input.streak, studyDay(now)),
    daysStudied: activityDays.size,
    week: studyWeek(activityDays, studyDay(now)),
    chaptersStarted,
    chaptersTotal: subjects.reduce((n, s) => n + s.chaptersTotal, 0),
    firstDay: chaptersStarted === 0 && input.activityAt.length === 0,
  };
}
