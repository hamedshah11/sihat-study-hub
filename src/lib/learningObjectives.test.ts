import { describe, expect, test } from "vitest";
import { parseLearningObjectives, serialiseLearningObjectives } from "./learningObjectives";

describe("parseLearningObjectives", () => {
  test("preserves order", () => {
    expect(parseLearningObjectives(["b", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  // Requirement: a chapter without objectives must render exactly as before,
  // so every "no objectives" shape has to collapse to the same empty result.
  test("null, undefined and empty array all mean no objectives", () => {
    expect(parseLearningObjectives(null)).toEqual([]);
    expect(parseLearningObjectives(undefined)).toEqual([]);
    expect(parseLearningObjectives([])).toEqual([]);
  });

  test("malformed values degrade to empty rather than throwing", () => {
    expect(parseLearningObjectives("not an array")).toEqual([]);
    expect(parseLearningObjectives({ objectives: ["a"] })).toEqual([]);
    expect(parseLearningObjectives(42)).toEqual([]);
  });

  test("drops non-strings and blank entries, trims the rest", () => {
    expect(parseLearningObjectives(["  a  ", "", "   ", 7, null, "b"])).toEqual(["a", "b"]);
  });
});

describe("serialiseLearningObjectives", () => {
  test("round-trips an ordered list", () => {
    const objectives = ["Describe the cell membrane", "List the four tissue types"];
    expect(parseLearningObjectives(serialiseLearningObjectives(objectives))).toEqual(objectives);
  });

  test("an empty or all-blank list stores as null, not []", () => {
    expect(serialiseLearningObjectives([])).toBeNull();
    expect(serialiseLearningObjectives(["", "   "])).toBeNull();
  });

  test("trims entries and drops blanks while preserving order", () => {
    expect(serialiseLearningObjectives([" first ", "", "second"])).toEqual(["first", "second"]);
  });
});
