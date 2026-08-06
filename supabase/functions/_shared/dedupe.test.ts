// Run with: bun run test (vitest)
import { describe, expect, test } from "vitest";
import {
  DICE_THRESHOLD_FLASHCARD,
  DICE_THRESHOLD_QUESTION,
  WORD_JACCARD_MIN,
  diceCoefficient,
  filterDuplicates,
  normalise,
  wordJaccard,
} from "./dedupe";

describe("normalise", () => {
  test("case and punctuation insensitive", () => {
    expect(normalise("What is HOMEOSTASIS?")).toBe(normalise("what is homeostasis"));
  });

  test("collapses non-alphanumeric runs to single spaces and trims", () => {
    expect(normalise("  Define -- the (cell) membrane!  ")).toBe("define the cell membrane");
  });
});

describe("diceCoefficient", () => {
  test("rephrased stem scores above the question threshold", () => {
    expect(diceCoefficient("Define the cell membrane", "Define cell membrane")).toBeGreaterThan(
      DICE_THRESHOLD_QUESTION,
    );
  });

  test("unrelated stems score below 0.3", () => {
    expect(
      diceCoefficient("Name the four tissue types", "List the bones of the axial skeleton"),
    ).toBeLessThan(0.3);
  });

  test("identical stems score 1", () => {
    expect(diceCoefficient("What is homeostasis?", "what is HOMEOSTASIS")).toBe(1);
  });
});

describe("wordJaccard", () => {
  test("identical word sets score 1, disjoint score 0", () => {
    expect(wordJaccard("Define the cell membrane", "define THE cell membrane!")).toBe(1);
    expect(wordJaccard("mitosis", "skeleton")).toBe(0);
  });

  test("a minimal pair shares only the frame", () => {
    // {define} / {define, mitosis, meiosis} = 1/3
    expect(wordJaccard("Define mitosis", "Define meiosis")).toBeCloseTo(1 / 3, 5);
  });

  test("a true rewording keeps most of its vocabulary", () => {
    // {define, cell, membrane} / {define, the, cell, membrane} = 3/4
    expect(wordJaccard("Define the cell membrane", "Define cell membrane")).toBeCloseTo(0.75, 5);
  });

  test("empty input does not produce NaN", () => {
    expect(wordJaccard("", "")).toBe(0);
    expect(wordJaccard("", "Define mitosis")).toBe(0);
  });
});

describe("conjunctive similarity gate", () => {
  // Bigram Dice alone cannot separate a swapped term from a rewording. These
  // two are distinct, valid cards that both belong in Cell/Tissues & Membranes,
  // yet Dice puts them at 0.769 — above the question threshold. Word overlap
  // (0.33) is what rescues them.
  const MITOSIS = "Define mitosis";
  const MEIOSIS = "Define meiosis";

  test("the minimal pair clears Dice but fails the word-overlap gate", () => {
    expect(diceCoefficient(MITOSIS, MEIOSIS)).toBeGreaterThan(DICE_THRESHOLD_QUESTION);
    expect(wordJaccard(MITOSIS, MEIOSIS)).toBeLessThan(WORD_JACCARD_MIN);
  });

  test("mitosis/meiosis is kept as a question", () => {
    const result = filterDuplicates(
      [{ prompt: MEIOSIS }],
      (q) => q.prompt,
      [MITOSIS],
      DICE_THRESHOLD_QUESTION,
    );
    expect(result.kept).toEqual([{ prompt: MEIOSIS }]);
    expect(result.dropped_duplicates).toBe(0);
  });

  test("mitosis/meiosis is kept as a flashcard", () => {
    const result = filterDuplicates(
      [{ front: MEIOSIS }],
      (c) => c.front,
      [MITOSIS],
      DICE_THRESHOLD_FLASHCARD,
    );
    expect(result.kept).toEqual([{ front: MEIOSIS }]);
    expect(result.dropped_duplicates).toBe(0);
  });

  test("a true rewording still passes both gates and is dropped", () => {
    const a = "Define the cell membrane";
    const b = "Define cell membrane";
    expect(diceCoefficient(a, b)).toBeGreaterThan(DICE_THRESHOLD_FLASHCARD);
    expect(wordJaccard(a, b)).toBeGreaterThanOrEqual(WORD_JACCARD_MIN);
    for (const threshold of [DICE_THRESHOLD_QUESTION, DICE_THRESHOLD_FLASHCARD]) {
      const result = filterDuplicates([{ text: b }], (i) => i.text, [a], threshold);
      expect(result.kept).toEqual([]);
      expect(result.dropped_duplicates).toBe(1);
    }
  });
});

describe("per-kind thresholds", () => {
  test("flashcards are held to a stricter threshold than questions", () => {
    expect(DICE_THRESHOLD_QUESTION).toBe(0.75);
    expect(DICE_THRESHOLD_FLASHCARD).toBe(0.85);
    expect(DICE_THRESHOLD_FLASHCARD).toBeGreaterThan(DICE_THRESHOLD_QUESTION);
  });

  // The generate-content call site pairs question prompts with
  // DICE_THRESHOLD_QUESTION and flashcard fronts with DICE_THRESHOLD_FLASHCARD.
  // This pair sits between the two (0.8163), so the pairing is observable:
  // the same texts are a duplicate as questions but distinct as flashcards.
  const A = "Function of the cell membrane";
  const B = "Cell membrane function";

  test("the borderline pair really does score ~0.80", () => {
    const score = diceCoefficient(A, B);
    expect(score).toBeGreaterThan(DICE_THRESHOLD_QUESTION);
    expect(score).toBeLessThan(DICE_THRESHOLD_FLASHCARD);
  });

  test("a ~0.80 pair is dropped as a question", () => {
    const result = filterDuplicates([{ prompt: B }], (q) => q.prompt, [A], DICE_THRESHOLD_QUESTION);
    expect(result.kept).toEqual([]);
    expect(result.dropped_duplicates).toBe(1);
  });

  test("the same ~0.80 pair is kept as a flashcard", () => {
    const result = filterDuplicates([{ front: B }], (c) => c.front, [A], DICE_THRESHOLD_FLASHCARD);
    expect(result.kept).toEqual([{ front: B }]);
    expect(result.dropped_duplicates).toBe(0);
  });

  test("an exact normalised match is dropped under either threshold", () => {
    for (const threshold of [DICE_THRESHOLD_QUESTION, DICE_THRESHOLD_FLASHCARD]) {
      const result = filterDuplicates(
        [{ text: "define the CELL membrane!" }],
        (i) => i.text,
        ["Define the cell membrane"],
        threshold,
      );
      expect(result.kept).toEqual([]);
      expect(result.dropped_duplicates).toBe(1);
    }
  });
});

describe("filterDuplicates", () => {
  test("drops the item identical to an existing item, keeps the novel one", () => {
    const existing = ["What is homeostasis?"];
    const batch = [
      { prompt: "What is homeostasis?" },
      { prompt: "Name the bones of the axial skeleton" },
    ];
    const result = filterDuplicates(batch, (q) => q.prompt, existing, DICE_THRESHOLD_QUESTION);
    expect(result.kept).toEqual([{ prompt: "Name the bones of the axial skeleton" }]);
    expect(result.dropped_duplicates).toBe(1);
  });

  test("empty existing set returns the batch unchanged", () => {
    const batch = [
      { prompt: "What is homeostasis?" },
      { prompt: "Name the bones of the axial skeleton" },
    ];
    const result = filterDuplicates(batch, (q) => q.prompt, [], DICE_THRESHOLD_QUESTION);
    expect(result.kept).toEqual(batch);
    expect(result.dropped_duplicates).toBe(0);
  });

  test("drops near-duplicates above the Dice threshold", () => {
    const result = filterDuplicates(
      [{ front: "Define cell membrane" }],
      (c) => c.front,
      ["Define the cell membrane"],
      DICE_THRESHOLD_FLASHCARD,
    );
    expect(result.kept).toEqual([]);
    expect(result.dropped_duplicates).toBe(1);
  });

  test("de-duplicates the batch against itself", () => {
    const batch = [
      { front: "Define the cell membrane" },
      { front: "define the CELL membrane!" }, // exact after normalisation
      { front: "Define cell membrane" }, // near-duplicate by Dice (0.9048)
      { front: "List the bones of the axial skeleton" },
    ];
    const result = filterDuplicates(batch, (c) => c.front, [], DICE_THRESHOLD_FLASHCARD);
    expect(result.kept).toEqual([
      { front: "Define the cell membrane" },
      { front: "List the bones of the axial skeleton" },
    ]);
    expect(result.dropped_duplicates).toBe(2);
  });
});
