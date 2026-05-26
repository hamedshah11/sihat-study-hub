// Simple spaced repetition scheduler. Replace with full FSRS later.
// All inputs/outputs are intentionally small and serializable so they map
// directly onto rows in the `flashcard_reviews` table.

export type Rating = "again" | "hard" | "good" | "easy";

export type ReviewState = {
  reps: number;
  lapses: number;
  state: "new" | "learning" | "review";
  stability: number;
  difficulty: number;
  scheduled_days: number;
  elapsed_days: number;
  last_review: string | null;
  next_review_at: string; // YYYY-MM-DD
};

const INTERVALS: Record<Rating, number> = {
  again: 1,
  hard: 2,
  good: 4,
  easy: 7,
};

function addDaysISO(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string | null): number {
  if (!fromISO) return 0;
  const from = new Date(fromISO).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - from) / 86400000));
}

export function schedule(
  prev: Partial<ReviewState> | null,
  rating: Rating,
): ReviewState {
  const reps = (prev?.reps ?? 0) + 1;
  const lapses = (prev?.lapses ?? 0) + (rating === "again" ? 1 : 0);
  const scheduled_days = INTERVALS[rating];
  const elapsed_days = daysBetween(prev?.last_review ?? null);
  const nowISO = new Date().toISOString();

  // Lightweight stability/difficulty tracking so a future FSRS swap has
  // something to read. Values are bounded but not used for scheduling yet.
  const baseDifficulty = prev?.difficulty ?? 5;
  const difficulty = Math.min(
    10,
    Math.max(
      1,
      rating === "again"
        ? baseDifficulty + 1.5
        : rating === "hard"
          ? baseDifficulty + 0.5
          : rating === "easy"
            ? baseDifficulty - 0.5
            : baseDifficulty,
    ),
  );
  const stability = rating === "again" ? 1 : (prev?.stability ?? 0) + scheduled_days;

  const state: ReviewState["state"] =
    rating === "again" ? "learning" : reps >= 2 ? "review" : "learning";

  return {
    reps,
    lapses,
    state,
    stability,
    difficulty,
    scheduled_days,
    elapsed_days,
    last_review: nowISO,
    next_review_at: addDaysISO(scheduled_days),
  };
}

export const SESSION_SIZE = 10;
