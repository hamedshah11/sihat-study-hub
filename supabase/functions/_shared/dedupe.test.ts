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
  // Re-anchored when the question threshold moved 0.75 -> 0.92: only a
  // near-verbatim pair clears it now, so the coverage is split in two.
  test("a near-verbatim stem scores above the question threshold", () => {
    expect(
      diceCoefficient(
        "Describe the structure of the cell membrane",
        "Describe the structure of a cell membrane",
      ),
    ).toBeGreaterThan(DICE_THRESHOLD_QUESTION);
  });

  test("a rephrased stem scores above the flashcard threshold", () => {
    expect(diceCoefficient("Define the cell membrane", "Define cell membrane")).toBeGreaterThan(
      DICE_THRESHOLD_FLASHCARD,
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

  // Re-anchored for the 0.92 question threshold: 0.769 no longer clears it, so
  // the gate is exercised directly with a deliberately permissive threshold.
  // That keeps the conjunctive behaviour under test independently of whatever
  // the production constants happen to be.
  test("the minimal pair fails the word-overlap gate", () => {
    expect(wordJaccard(MITOSIS, MEIOSIS)).toBeLessThan(WORD_JACCARD_MIN);
  });

  test("word overlap blocks the minimal pair even when Dice would allow it", () => {
    const permissive = 0.7; // below the pair's Dice score of 0.769
    expect(diceCoefficient(MITOSIS, MEIOSIS)).toBeGreaterThan(permissive);
    const result = filterDuplicates([{ prompt: MEIOSIS }], (q) => q.prompt, [MITOSIS], permissive);
    expect(result.kept).toEqual([{ prompt: MEIOSIS }]);
    expect(result.dropped_duplicates).toBe(0);
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

  test("a true rewording passes both gates and is dropped as a flashcard", () => {
    const a = "Define the cell membrane";
    const b = "Define cell membrane";
    expect(diceCoefficient(a, b)).toBeGreaterThan(DICE_THRESHOLD_FLASHCARD);
    expect(wordJaccard(a, b)).toBeGreaterThanOrEqual(WORD_JACCARD_MIN);
    const result = filterDuplicates([{ text: b }], (i) => i.text, [a], DICE_THRESHOLD_FLASHCARD);
    expect(result.kept).toEqual([]);
    expect(result.dropped_duplicates).toBe(1);
  });

  test("a near-verbatim rewording passes both gates and is dropped as a question", () => {
    const a = "Describe the structure of the cell membrane";
    const b = "Describe the structure of a cell membrane";
    expect(diceCoefficient(a, b)).toBeGreaterThan(DICE_THRESHOLD_QUESTION);
    expect(wordJaccard(a, b)).toBeGreaterThanOrEqual(WORD_JACCARD_MIN);
    const result = filterDuplicates([{ text: b }], (i) => i.text, [a], DICE_THRESHOLD_QUESTION);
    expect(result.kept).toEqual([]);
    expect(result.dropped_duplicates).toBe(1);
  });
});

// The false-positive class the 0.92 threshold exists to protect: one question
// template reused for a different subject. Both metrics score high (0.824 /
// 0.667) because the pair differs by a single content word, so the word-overlap
// gate does NOT rescue it — only the conservative Dice threshold does.
describe("template-swap false positives", () => {
  const POLIO = "How is polio primarily transmitted?";
  const CHOLERA = "How is cholera primarily transmitted?";

  test("both metrics score high on a template swap", () => {
    expect(diceCoefficient(POLIO, CHOLERA)).toBeGreaterThan(0.8);
    expect(wordJaccard(POLIO, CHOLERA)).toBeGreaterThanOrEqual(WORD_JACCARD_MIN);
  });

  test("the template swap is kept as a question", () => {
    const result = filterDuplicates(
      [{ prompt: CHOLERA }],
      (q) => q.prompt,
      [POLIO],
      DICE_THRESHOLD_QUESTION,
    );
    expect(result.kept).toEqual([{ prompt: CHOLERA }]);
    expect(result.dropped_duplicates).toBe(0);
  });

  test("the template swap is kept as a flashcard", () => {
    const result = filterDuplicates(
      [{ front: CHOLERA }],
      (c) => c.front,
      [POLIO],
      DICE_THRESHOLD_FLASHCARD,
    );
    expect(result.kept).toEqual([{ front: CHOLERA }]);
    expect(result.dropped_duplicates).toBe(0);
  });
});

describe("per-kind thresholds", () => {
  // Re-anchored: questions moved 0.75 -> 0.92, so questions are now the
  // STRICTER kind and the divergence runs the other way than it used to.
  test("questions are held to a stricter threshold than flashcards", () => {
    expect(DICE_THRESHOLD_QUESTION).toBe(0.92);
    expect(DICE_THRESHOLD_FLASHCARD).toBe(0.85);
    expect(DICE_THRESHOLD_QUESTION).toBeGreaterThan(DICE_THRESHOLD_FLASHCARD);
  });

  // The generate-content call site pairs question prompts with
  // DICE_THRESHOLD_QUESTION and flashcard fronts with DICE_THRESHOLD_FLASHCARD.
  // This pair scores 0.905 — between the two — so the pairing stays observable:
  // the same texts are distinct as questions but a duplicate as flashcards.
  const A = "Define the cell membrane";
  const B = "Define cell membrane";

  test("the divergence pair sits between the two thresholds", () => {
    const score = diceCoefficient(A, B);
    expect(score).toBeGreaterThan(DICE_THRESHOLD_FLASHCARD);
    expect(score).toBeLessThan(DICE_THRESHOLD_QUESTION);
  });

  test("the divergence pair is kept as a question", () => {
    const result = filterDuplicates([{ prompt: B }], (q) => q.prompt, [A], DICE_THRESHOLD_QUESTION);
    expect(result.kept).toEqual([{ prompt: B }]);
    expect(result.dropped_duplicates).toBe(0);
  });

  test("the same divergence pair is dropped as a flashcard", () => {
    const result = filterDuplicates([{ front: B }], (c) => c.front, [A], DICE_THRESHOLD_FLASHCARD);
    expect(result.kept).toEqual([]);
    expect(result.dropped_duplicates).toBe(1);
  });

  // Retained from the 0.75 era: this pair used to be dropped as a question.
  // At 0.92 it survives for both kinds — kept as explicit coverage of the
  // raised boundary rather than deleted.
  test("a ~0.80 rewording now survives for both kinds", () => {
    const a = "Function of the cell membrane";
    const b = "Cell membrane function";
    expect(diceCoefficient(a, b)).toBeLessThan(DICE_THRESHOLD_FLASHCARD);
    for (const threshold of [DICE_THRESHOLD_QUESTION, DICE_THRESHOLD_FLASHCARD]) {
      const result = filterDuplicates([{ text: b }], (i) => i.text, [a], threshold);
      expect(result.kept).toEqual([{ text: b }]);
      expect(result.dropped_duplicates).toBe(0);
    }
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
      [{ front: "List the main functions of the plasma cell membranes in homeostasis" }],
      (c) => c.front,
      ["List the main functions of the plasma cell membrane in homeostasis"],
      DICE_THRESHOLD_FLASHCARD,
    );
    expect(result.kept).toEqual([]);
    expect(result.dropped_duplicates).toBe(1);
  });

  test("de-duplicates the batch against itself", () => {
    const batch = [
      { front: "Define the cell membrane" },
      { front: "define the CELL membrane!" }, // exact after normalisation
      { front: "List the main functions of the plasma cell membrane in homeostasis" },
      { front: "List the main functions of the plasma cell membranes in homeostasis" }, // 0.9771
      { front: "List the bones of the axial skeleton" },
    ];
    const result = filterDuplicates(batch, (c) => c.front, [], DICE_THRESHOLD_FLASHCARD);
    expect(result.kept).toEqual([
      { front: "Define the cell membrane" },
      { front: "List the main functions of the plasma cell membrane in homeostasis" },
      { front: "List the bones of the axial skeleton" },
    ]);
    expect(result.dropped_duplicates).toBe(2);
  });
});
