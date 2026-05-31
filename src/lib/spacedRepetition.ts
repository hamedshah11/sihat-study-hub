// FSRS-6 scheduler backed by ts-fsrs. The exported shape is kept stable so
// that callers (e.g. ChapterFlashcards.tsx) and the `flashcard_reviews` row
// schema continue to work without any change.

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State as FsrsState,
  type Card as FsrsCard,
} from "ts-fsrs";

export type Rating = "again" | "hard" | "good" | "easy";

export type ReviewState = {
  reps: number;
  lapses: number;
  state: "new" | "learning" | "review" | "relearning";
  stability: number;
  difficulty: number;
  scheduled_days: number;
  elapsed_days: number;
  last_review: string | null;
  next_review_at: string; // YYYY-MM-DD
};

export const SESSION_SIZE = 10;

const f = fsrs(generatorParameters({ enable_fuzz: true }));

const RATING_TO_GRADE: Record<Rating, FsrsRating> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

function mapStringToState(s: ReviewState["state"] | string | null | undefined): FsrsState {
  switch (s) {
    case "learning":
      return FsrsState.Learning;
    case "review":
      return FsrsState.Review;
    case "relearning":
      return FsrsState.Relearning;
    case "new":
    default:
      return FsrsState.New;
  }
}

function mapStateToString(s: FsrsState): ReviewState["state"] {
  switch (s) {
    case FsrsState.Learning:
      return "learning";
    case FsrsState.Review:
      return "review";
    case FsrsState.Relearning:
      return "relearning";
    case FsrsState.New:
    default:
      return "new";
  }
}

export function schedule(
  prev: Partial<ReviewState> | null,
  rating: Rating,
): ReviewState {
  const now = new Date();
  const grade = RATING_TO_GRADE[rating];

  let card: FsrsCard;
  if (!prev) {
    card = createEmptyCard(now);
  } else {
    card = {
      due: prev.next_review_at ? new Date(prev.next_review_at) : now,
      stability: prev.stability ?? 0,
      difficulty: prev.difficulty ?? 0,
      elapsed_days: prev.elapsed_days ?? 0,
      scheduled_days: prev.scheduled_days ?? 0,
      reps: prev.reps ?? 0,
      lapses: prev.lapses ?? 0,
      state: mapStringToState(prev.state),
      last_review: prev.last_review ? new Date(prev.last_review) : undefined,
      learning_steps: 0,
    } as FsrsCard;
  }

  const { card: next } = f.next(card, now, grade);

  return {
    reps: next.reps,
    lapses: next.lapses,
    state: mapStateToString(next.state),
    stability: next.stability,
    difficulty: next.difficulty,
    scheduled_days: next.scheduled_days,
    elapsed_days: next.elapsed_days,
    last_review: now.toISOString(),
    next_review_at: next.due.toISOString().slice(0, 10),
  };
}
