import type { CSSProperties } from "react";

// Florence petal colours: one per subject, used only to identify a subject
// (rose petals, the bar beside a subject's name, dots). Never for status, and
// never as text on light backgrounds — several petals fail contrast on Linen.
//
// The database still stores the colour family keys from the earlier design
// (subjects.colour, checked by subjects_colour_check), so the keys stay and
// each family maps to a petal. For Semester 1 this gives exactly the brand
// book's assignment: Fundamentals → Lamplight, A&P → Sky, Microbiology → Sage,
// Biochemistry → Lilac, English → Rose, Computer Skills → Teal.
export const SUBJECT_COLOURS = {
  cobalt: { label: "Lamplight", fill: "#F4B23E" },
  violet: { label: "Sky", fill: "#8BB8F0" },
  mint: { label: "Sage", fill: "#8CC5A2" },
  sky: { label: "Lilac", fill: "#B9A4F2" },
  indigo: { label: "Rose", fill: "#E2737F" },
  aqua: { label: "Teal", fill: "#6FC7C0" },
  pink: { label: "Ember", fill: "#E9773E" },
  slate: { label: "Wheat", fill: "#E8D9B0" },
} as const;

export type SubjectColour = keyof typeof SUBJECT_COLOURS;

/** Petal order for a subject's position when no colour is stored. */
const PETAL_ORDER: SubjectColour[] = [
  "cobalt",
  "violet",
  "mint",
  "sky",
  "indigo",
  "aqua",
  "pink",
  "slate",
];

export function isSubjectColour(value: unknown): value is SubjectColour {
  return typeof value === "string" && value in SUBJECT_COLOURS;
}

export function petalColour(value: unknown, fallbackIndex = 0): string {
  if (isSubjectColour(value)) return SUBJECT_COLOURS[value].fill;
  return SUBJECT_COLOURS[PETAL_ORDER[fallbackIndex % PETAL_ORDER.length]].fill;
}

/** Inline style for an element with the `subject-colour` class. */
export function subjectColourVariables(value: unknown, fallbackIndex = 0): CSSProperties {
  return { "--subject": petalColour(value, fallbackIndex) } as CSSProperties;
}
