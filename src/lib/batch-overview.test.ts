import { describe, expect, it } from "vitest";
import { circleMembersFrom, hardestSubjectFrom } from "./batch-overview";

describe("hardest subject", () => {
  const subjects = [
    { id: "micro", name: "Microbiology" },
    { id: "anat", name: "Anatomy" },
  ];
  const chapters = [
    { id: "m1", subject_id: "micro" },
    { id: "a1", subject_id: "anat" },
  ];
  const rows = (chapter: string, scores: number[]) =>
    scores.map((mastery_score, i) => ({ user_id: `s${i}`, chapter_id: chapter, mastery_score }));

  it("names the subject with the lowest average", () => {
    expect(
      hardestSubjectFrom(subjects, chapters, [
        ...rows("m1", [40, 50, 60]),
        ...rows("a1", [80, 90, 70]),
      ]),
    ).toBe("Microbiology");
  });

  it("needs three students in at least two subjects", () => {
    expect(
      hardestSubjectFrom(subjects, chapters, [
        ...rows("m1", [40, 50]),
        ...rows("a1", [80, 90, 70]),
      ]),
    ).toBeNull();
  });

  it("ignores rows without a score or outside the semester", () => {
    expect(
      hardestSubjectFrom(subjects, chapters, [
        ...rows("m1", [40, 50, 60]),
        ...rows("a1", [80, 90, 70]),
        { user_id: "s0", chapter_id: "other", mastery_score: 0 },
        { user_id: "s1", chapter_id: "a1", mastery_score: null },
      ]),
    ).toBe("Microbiology");
  });
});

describe("circle members", () => {
  it("keeps joined order and shows today's study only for those who opted in", () => {
    expect(
      circleMembersFrom(
        ["u2", "u1", "u3"],
        "u1",
        [
          { id: "u1", display_name: "Ayesha Memon" },
          { id: "u2", display_name: "  Sana  Khan " },
          { id: "u3", display_name: null },
        ],
        [
          { user_id: "u1", show_in_circles: true },
          { user_id: "u2", show_in_circles: true },
          { user_id: "u3", show_in_circles: false },
        ],
        ["u2", "u3", null],
      ),
    ).toEqual([
      { firstName: "Sana", studiedToday: true, isMe: false },
      { firstName: "Ayesha", studiedToday: false, isMe: true },
      { firstName: "Friend", studiedToday: null, isMe: false },
    ]);
  });
});
