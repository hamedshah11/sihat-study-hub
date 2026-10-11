import { describe, expect, it } from "vitest";
import { countByChapter, earlierSubjectsFrom, earliestSemesterSubjects } from "./progress-snapshot";

const subject = (id: string, semester_id: string, display_order: number) => ({
  id,
  name: id,
  colour: null,
  display_order,
  semester_id,
});

describe("earlier subjects for revision", () => {
  const semesters = [
    { id: "s3", name: "Semester 3", number: 3, subjects: [subject("c", "s3", 1)] },
    {
      id: "s1",
      name: "Semester 1",
      number: 1,
      subjects: [subject("a2", "s1", 2), subject("a1", "s1", 1)],
    },
    { id: "s2", name: "Semester 2", number: 2, subjects: [subject("b", "s2", 1)] },
  ];

  it("lists earlier semesters' subjects, earliest first, in teaching order", () => {
    expect(earlierSubjectsFrom(semesters, "s3")).toEqual([
      { id: "a1", name: "a1", colour: null, semesterName: "Semester 1" },
      { id: "a2", name: "a2", colour: null, semesterName: "Semester 1" },
      { id: "b", name: "b", colour: null, semesterName: "Semester 2" },
    ]);
  });

  it("has nothing before the first semester or without a current one", () => {
    expect(earlierSubjectsFrom(semesters, "s1")).toEqual([]);
    expect(earlierSubjectsFrom(semesters, null)).toEqual([]);
    expect(earlierSubjectsFrom(semesters, "unknown")).toEqual([]);
  });
});

describe("the semester shown without a batch", () => {
  it("picks the earliest semester with published chapters", () => {
    const semesters = [
      { id: "s1", number: 1 },
      { id: "s2", number: 2 },
    ];
    const subjects = [subject("a", "s1", 1), subject("b", "s2", 1), subject("c", "s2", 2)];
    expect(
      earliestSemesterSubjects(semesters, subjects, [{ subject_id: "b" }]).map((s) => s.id),
    ).toEqual(["b"]);
    expect(
      earliestSemesterSubjects(semesters, subjects, [{ subject_id: "a" }, { subject_id: "c" }]).map(
        (s) => s.id,
      ),
    ).toEqual(["a"]);
    expect(earliestSemesterSubjects(semesters, subjects, [])).toEqual([]);
  });
});

describe("question counts", () => {
  it("counts rows per chapter", () => {
    expect(countByChapter([{ chapter_id: "x" }, { chapter_id: "y" }, { chapter_id: "x" }])).toEqual(
      new Map([
        ["x", 2],
        ["y", 1],
      ]),
    );
  });
});
