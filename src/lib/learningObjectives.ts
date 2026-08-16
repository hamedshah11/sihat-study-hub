// Chapter learning objectives are stored in `chapters.learning_objectives` as a
// nullable jsonb ordered array of strings.
//
// NULL and [] mean the same thing to every reader — "no objectives" — and both
// must render as if the feature did not exist. Keeping the coercion here means
// no caller has to remember that, and a malformed value (wrong type, nested
// junk, blank strings) degrades to "no objectives" rather than throwing in the
// middle of a chapter render.

export function parseLearningObjectives(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Inverse of the above, for writes: an empty list is stored as NULL so the
// column stays absent rather than accumulating empty arrays.
export function serialiseLearningObjectives(objectives: string[]): string[] | null {
  const cleaned = objectives.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}
