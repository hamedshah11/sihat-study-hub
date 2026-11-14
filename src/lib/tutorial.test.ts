import { describe, expect, it } from "vitest";
import {
  TUTORIAL_VERSION,
  hasSeenTutorial,
  hintSeenMetadata,
  seenHints,
  shouldShowHint,
  tutorialSeenMetadata,
} from "./tutorial";

describe("hasSeenTutorial", () => {
  it("is false for an account that never took the tour", () => {
    expect(hasSeenTutorial(null)).toBe(false);
    expect(hasSeenTutorial({})).toBe(false);
    expect(hasSeenTutorial({ tutorial_version: "1" })).toBe(false);
  });

  it("is true once the current version is saved", () => {
    expect(hasSeenTutorial(tutorialSeenMetadata())).toBe(true);
    expect(hasSeenTutorial({ tutorial_version: TUTORIAL_VERSION + 1 })).toBe(true);
  });

  it("asks again after the version goes up", () => {
    expect(hasSeenTutorial({ tutorial_version: TUTORIAL_VERSION - 1 })).toBe(false);
  });
});

describe("hints", () => {
  const toured = tutorialSeenMetadata();

  it("ignores anything that isn't a known hint id", () => {
    expect(seenHints({ tutorial_hints: ["batch", "nonsense", 4] })).toEqual(["batch"]);
    expect(seenHints({ tutorial_hints: "batch" })).toEqual([]);
  });

  it("shows a hint only after the tour, and only once", () => {
    expect(shouldShowHint("subjects", {}, false)).toBe(false);
    expect(shouldShowHint("subjects", toured, false)).toBe(true);
    expect(shouldShowHint("subjects", { ...toured, tutorial_hints: ["subjects"] }, false)).toBe(
      false,
    );
    expect(shouldShowHint("chapter", { ...toured, tutorial_hints: ["subjects"] }, false)).toBe(
      true,
    );
  });

  it("stays hidden when this phone already dismissed it", () => {
    expect(shouldShowHint("subjects", toured, true)).toBe(false);
  });

  it("keeps earlier hints when another is dismissed", () => {
    const next = hintSeenMetadata("chapter", { tutorial_hints: ["subjects"] });
    expect(next.tutorial_hints).toEqual(["subjects", "chapter"]);
    expect(hintSeenMetadata("chapter", next).tutorial_hints).toEqual(["subjects", "chapter"]);
  });
});
