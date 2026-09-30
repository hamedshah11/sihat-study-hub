import type { CSSProperties } from "react";

export const SUBJECT_COLOURS = {
  cobalt: {
    label: "Cobalt",
    fill: "#1F4FD8",
    deep: "#163C9E",
    tint: "#DCE7FB",
    tint2: "#C5D6F6",
    ink: "#163C9E",
    darkTint: "#13284A",
    darkTint2: "#1C3862",
    darkInk: "#A9C4FF",
  },
  violet: {
    label: "Violet",
    fill: "#6D4AE8",
    deep: "#4B2DB8",
    tint: "#ECE6FF",
    tint2: "#D9CEFC",
    ink: "#4B2DB8",
    darkTint: "#231A4A",
    darkTint2: "#352768",
    darkInk: "#C9B8FF",
  },
  pink: {
    label: "Pink",
    fill: "#BE185D",
    deep: "#9D174D",
    tint: "#FCE7F1",
    tint2: "#F5C5DA",
    ink: "#9D174D",
    darkTint: "#3A1226",
    darkTint2: "#571936",
    darkInk: "#F9A8D4",
  },
  mint: {
    label: "Mint",
    fill: "#0B7A6E",
    deep: "#0B6B61",
    tint: "#D8F3EF",
    tint2: "#B9E3DC",
    ink: "#0B6B61",
    darkTint: "#0A2E2B",
    darkTint2: "#10433E",
    darkInk: "#7EDCCF",
  },
  sky: {
    label: "Sky",
    fill: "#0369A1",
    deep: "#075985",
    tint: "#DDF1FB",
    tint2: "#BFDDED",
    ink: "#075985",
    darkTint: "#0C2A3D",
    darkTint2: "#103D57",
    darkInk: "#8FD3F7",
  },
  indigo: {
    label: "Indigo",
    fill: "#4338CA",
    deep: "#3730A3",
    tint: "#E3E2FB",
    tint2: "#C9C6F2",
    ink: "#3730A3",
    darkTint: "#1C1B45",
    darkTint2: "#292761",
    darkInk: "#B7B4FA",
  },
  aqua: {
    label: "Aqua",
    fill: "#0E6E8C",
    deep: "#0E6377",
    tint: "#D6F3F8",
    tint2: "#B7DFE8",
    ink: "#0E6377",
    darkTint: "#0B2A33",
    darkTint2: "#103D49",
    darkInk: "#86DDEE",
  },
  slate: {
    label: "Slate",
    fill: "#475569",
    deep: "#334155",
    tint: "#E8EDF3",
    tint2: "#CDD5DF",
    ink: "#334155",
    darkTint: "#1E2633",
    darkTint2: "#2C3748",
    darkInk: "#CBD5E1",
  },
} as const;

export type SubjectColour = keyof typeof SUBJECT_COLOURS;

export function isSubjectColour(value: unknown): value is SubjectColour {
  return typeof value === "string" && value in SUBJECT_COLOURS;
}

export function subjectColourVariables(value: unknown): CSSProperties {
  const colour = SUBJECT_COLOURS[isSubjectColour(value) ? value : "cobalt"];
  return {
    "--subject": colour.fill,
    "--subject-light-deep": colour.deep,
    "--subject-light-tint": colour.tint,
    "--subject-light-tint-2": colour.tint2,
    "--subject-light-ink": colour.ink,
    "--subject-dark-tint": colour.darkTint,
    "--subject-dark-tint-2": colour.darkTint2,
    "--subject-dark-ink": colour.darkInk,
  } as CSSProperties;
}
