// Exam mode settings. Change question counts or time limits here; both the
// server (question selection, deadline) and the UI read from this file.

export type ExamMode = "quick" | "full";

export const EXAM_MODES: Record<
  ExamMode,
  { label: string; questions: number; minutes: number; description: string }
> = {
  quick: {
    label: "Quick exam",
    questions: 25,
    minutes: 30,
    description: "A shorter paper for a focused check-in.",
  },
  full: {
    label: "Full exam",
    questions: 50,
    minutes: 60,
    description: "Paper length. Best done in one sitting.",
  },
};

// Target share of each difficulty in an exam. If a chapter runs short of one
// level, the gap is filled from the others.
export const DIFFICULTY_MIX = { easy: 0.3, medium: 0.5, hard: 0.2 } as const;

// Pass mark for exams, as a fraction.
export const EXAM_PASS_MARK = 0.8;

// An exam needs at least this many approved questions to start.
export const EXAM_MIN_QUESTIONS = 10;

// Submissions are accepted this long after the deadline (clock drift, slow
// networks). Later submissions are still graded but marked as late.
export const EXAM_GRACE_SECONDS = 120;
