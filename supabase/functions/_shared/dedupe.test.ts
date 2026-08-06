// Run with: bun run test (vitest)
import { describe, expect, test } from "vitest";
import {
  DICE_THRESHOLD_FLASHCARD,
  DICE_THRESHOLD_QUESTION,
  diceCoefficient,
  filterDuplicates,
  normalise,
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
