import { describe, expect, it } from "vitest";
import { computeMastery, estimateMinutes, stateFor, type ChapterEvidence } from "./mastery";

const now = new Date("2026-10-10T10:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function chapter(partial: Partial<ChapterEvidence>): ChapterEvidence {
  return {
    chapterId: "c",
    cardRecall: [],
    reviewedCards: 0,
    quizScore: null,
    quizAttempts: 0,
    firstActivityAt: null,
    ...partial,
  };
}

describe("computeMastery", () => {
  it("is not started when no chapter has a review or a quiz", () => {
    const r = computeMastery([chapter({ cardRecall: [0, 0, 0] })], now);
    expect(r).toMatchObject({ started: false, mastery: null, state: "not_started" });
  });

  it("weights recall 60% and quizzes 40% over started chapters only", () => {
    const r = computeMastery(
      [
        chapter({ cardRecall: [1, 0.5], reviewedCards: 2, quizScore: 50, quizAttempts: 1 }),
        // Not started: must not pull the subject down.
        chapter({ chapterId: "untouched", cardRecall: [0, 0, 0, 0] }),
      ],
      now,
    );
    // recall 0.75, quiz 0.5 -> 0.45 + 0.2
    expect(r.mastery).toBeCloseTo(0.65, 5);
    expect(r.state).toBe("growing");
  });

  it("counts unreviewed cards in a started chapter as zero recall", () => {
    const r = computeMastery(
      [chapter({ cardRecall: [1, 0, 0, 0], reviewedCards: 1, quizScore: null })],
      now,
    );
    expect(r.recall).toBeCloseTo(0.25, 5);
    expect(r.mastery).toBeCloseTo(0.15, 5);
    expect(r.state).toBe("needs_light");
  });

  it("uses quizzes alone when the chapters have no flashcards", () => {
    const r = computeMastery([chapter({ quizScore: 90, quizAttempts: 1 })], now);
    expect(r.mastery).toBeCloseTo(0.9, 5);
  });

  it("keeps an 80%+ subject growing until there is enough evidence", () => {
    const strong = { cardRecall: [1, 1], reviewedCards: 2, quizScore: 100 };
    const early = computeMastery(
      [chapter({ ...strong, quizAttempts: 1, firstActivityAt: daysAgo(20) })],
      now,
    );
    expect(early.state).toBe("growing");
    const recent = computeMastery(
      [chapter({ ...strong, quizAttempts: 3, firstActivityAt: daysAgo(5) })],
      now,
    );
    expect(recent.state).toBe("growing");
    const proven = computeMastery(
      [chapter({ ...strong, quizAttempts: 2, firstActivityAt: daysAgo(15) })],
      now,
    );
    expect(proven.state).toBe("in_bloom");
  });
});

describe("stateFor", () => {
  it("draws the boundaries at 40% and 80%", () => {
    const ev = { quizAttempts: 5, firstActivityAt: daysAgo(30) };
    expect(stateFor(0.39, ev, now)).toBe("needs_light");
    expect(stateFor(0.4, ev, now)).toBe("growing");
    expect(stateFor(0.79, ev, now)).toBe("growing");
    expect(stateFor(0.8, ev, now)).toBe("in_bloom");
  });
});

describe("estimateMinutes", () => {
  it("matches the brand book examples", () => {
    expect(estimateMinutes(18, 1)).toBe(12);
    expect(estimateMinutes(6)).toBe(3);
    expect(estimateMinutes(0)).toBe(0);
    expect(estimateMinutes(1)).toBe(2);
  });
});
