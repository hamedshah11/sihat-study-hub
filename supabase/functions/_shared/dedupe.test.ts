// Run with: bun test supabase/functions/_shared/dedupe.test.ts
import { describe, expect, test } from "bun:test";
import { diceCoefficient, filterDuplicates, normalise } from "./dedupe";

describe("normalise", () => {
  test("case and punctuation insensitive", () => {
    expect(normalise("What is HOMEOSTASIS?")).toBe(normalise("what is homeostasis"));
  });

  test("collapses non-alphanumeric runs to single spaces and trims", () => {
    expect(normalise("  Define -- the (cell) membrane!  ")).toBe("define the cell membrane");
  });
});

describe("diceCoefficient", () => {
  test("rephrased stem scores above the 0.62 threshold", () => {
    expect(diceCoefficient("Define the cell membrane", "Define cell membrane")).toBeGreaterThan(
      0.62,
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

describe("filterDuplicates", () => {
  test("drops the item identical to an existing item, keeps the novel one", () => {
    const existing = ["What is homeostasis?"];
    const batch = [
      { prompt: "What is homeostasis?" },
      { prompt: "Name the bones of the axial skeleton" },
    ];
    const result = filterDuplicates(batch, (q) => q.prompt, existing);
    expect(result.kept).toEqual([{ prompt: "Name the bones of the axial skeleton" }]);
    expect(result.dropped_duplicates).toBe(1);
  });

  test("empty existing set returns the batch unchanged", () => {
    const batch = [
      { prompt: "What is homeostasis?" },
      { prompt: "Name the bones of the axial skeleton" },
    ];
    const result = filterDuplicates(batch, (q) => q.prompt, []);
    expect(result.kept).toEqual(batch);
    expect(result.dropped_duplicates).toBe(0);
  });

  test("drops near-duplicates above the Dice threshold", () => {
    const result = filterDuplicates(
      [{ front: "Define cell membrane" }],
      (c) => c.front,
      ["Define the cell membrane"],
    );
    expect(result.kept).toEqual([]);
    expect(result.dropped_duplicates).toBe(1);
  });

  test("de-duplicates the batch against itself", () => {
    const batch = [
      { front: "Define the cell membrane" },
      { front: "define the CELL membrane!" }, // exact after normalisation
      { front: "Define cell membrane" }, // near-duplicate by Dice
      { front: "List the bones of the axial skeleton" },
    ];
    const result = filterDuplicates(batch, (c) => c.front, []);
    expect(result.kept).toEqual([
      { front: "Define the cell membrane" },
      { front: "List the bones of the axial skeleton" },
    ]);
    expect(result.dropped_duplicates).toBe(2);
  });
});
