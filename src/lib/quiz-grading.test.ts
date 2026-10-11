import { describe, expect, it } from "vitest";
import { collectAnswers, coversIssuedPaper, quizXpSource, rollingMastery } from "./quiz-grading";

describe("collecting a submission", () => {
  it("keeps the first answer per question", () => {
    expect(
      collectAnswers(
        [
          { questionId: "a", selectedIndex: 1 },
          { questionId: "b", selectedIndex: 2 },
          { questionId: "a", selectedIndex: 3 },
        ],
        {},
      ),
    ).toEqual([
      { questionId: "a", selectedIndex: 1 },
      { questionId: "b", selectedIndex: 2 },
    ]);
  });

  it("uses the locked answer over a later selection", () => {
    expect(
      collectAnswers(
        [
          { questionId: "a", selectedIndex: 1 },
          { questionId: "b", selectedIndex: 2 },
        ],
        { a: 0 },
      ),
    ).toEqual([
      { questionId: "a", selectedIndex: 0 },
      { questionId: "b", selectedIndex: 2 },
    ]);
  });

  it("accepts only the whole issued paper", () => {
    expect(coversIssuedPaper(["a", "b"], ["b", "a"])).toBe(true);
    expect(coversIssuedPaper(["a"], ["a", "b"])).toBe(false);
    expect(coversIssuedPaper(["a", "c"], ["a", "b"])).toBe(false);
  });
});

describe("quiz XP per chapter per day", () => {
  const fail = { score: 2, total_questions: 5 };
  const pass = { score: 4, total_questions: 5 };

  it("gives the first attempt quiz XP, or pass XP if it passes", () => {
    expect(quizXpSource([], false)).toBe("quiz");
    expect(quizXpSource([], true)).toBe("quiz_pass");
  });

  it("gives a later attempt pass XP only for the first pass of the day", () => {
    expect(quizXpSource([fail], true)).toBe("quiz_pass");
    expect(quizXpSource([fail, pass], true)).toBeNull();
    expect(quizXpSource([fail], false)).toBeNull();
  });
});

describe("rolling mastery", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 10, minutes)).toISOString();
  const prior = [
    { score: 5, total_questions: 5, attempted_at: at(30) },
    { score: 3, total_questions: 5, attempted_at: at(20) },
    { score: 1, total_questions: 5, attempted_at: at(10) },
  ];
  const attempt = { score: 4, total_questions: 5, attempted_at: at(40) };

  it("averages this attempt with the two before it", () => {
    // 80%, 100%, 60%
    expect(rollingMastery(prior, attempt, 0.8, 3)).toBe(80);
  });

  it("matches reading the newest attempts back in any order", () => {
    expect(rollingMastery([...prior].reverse(), attempt, 0.8, 3)).toBe(80);
  });

  it("leaves out an attempt that wasn't saved", () => {
    // 100%, 60%, 20%
    expect(rollingMastery(prior, null, 0.8, 3)).toBe(60);
  });

  it("uses this attempt alone when there is nothing else", () => {
    expect(rollingMastery([], attempt, 0.8, 3)).toBe(80);
    expect(rollingMastery([], null, 0.4, 3)).toBe(40);
  });

  it("skips empty attempts, as before", () => {
    const empty = { score: 0, total_questions: 0, attempted_at: at(35) };
    // 80%, (empty), 100%
    expect(rollingMastery([empty, ...prior], attempt, 0.8, 3)).toBe(90);
  });
});
