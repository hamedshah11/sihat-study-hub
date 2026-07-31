// Pure duplicate-detection helpers shared by generate-content. No Deno APIs —
// keep it that way so these stay unit-testable outside the edge runtime.

// Same normalisation as the retire_duplicate_content migration: lower-case,
// collapse every non-alphanumeric run to a single space, trim. Two stems with
// equal normalised keys are treated as exact duplicates.
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bigramCounts(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bigram = s.slice(i, i + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

// Sørensen–Dice coefficient over character bigrams of the normalised strings
// (multiset variant). 1 = identical, 0 = no shared bigrams.
export function diceCoefficient(a: string, b: string): number {
  const x = normalise(a);
  const y = normalise(b);
  if (x === y) return x.length > 0 ? 1 : 0;
  if (x.length < 2 || y.length < 2) return 0;
  const bx = bigramCounts(x);
  const by = bigramCounts(y);
  let shared = 0;
  for (const [bigram, count] of bx) {
    const other = by.get(bigram);
    if (other) shared += Math.min(count, other);
  }
  return (2 * shared) / (x.length - 1 + y.length - 1);
}

// Above this Dice score two stems are considered rephrasings of each other.
export const DICE_THRESHOLD = 0.62;

export type DedupeResult<T> = {
  kept: T[];
  dropped_duplicates: number;
};

// Filters `batch` against `existing` stems and against itself. An item is
// dropped when its normalised key exactly matches, or its Dice score exceeds
// `threshold` against, any existing stem or any earlier kept item in the batch.
export function filterDuplicates<T>(
  batch: T[],
  getText: (item: T) => string,
  existing: string[],
  threshold: number = DICE_THRESHOLD,
): DedupeResult<T> {
  const seenKeys = new Set<string>(existing.map(normalise));
  const seenTexts = existing.slice();
  const kept: T[] = [];
  let dropped = 0;

  for (const item of batch) {
    const text = getText(item);
    const key = normalise(text);
    const isDuplicate =
      seenKeys.has(key) || seenTexts.some((t) => diceCoefficient(text, t) > threshold);
    if (isDuplicate) {
      dropped++;
      continue;
    }
    kept.push(item);
    seenKeys.add(key);
    seenTexts.push(text);
  }

  return { kept, dropped_duplicates: dropped };
}
