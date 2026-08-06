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

// Above these Dice scores two stems are considered rephrasings of each other.
// The thresholds differ by kind because the two text populations do.
//
// Calibrated against a control cohort of six chapters that sit at the original
// 30 questions / 50 flashcards and contain zero exact duplicates — i.e. every
// pair scoring above a threshold there is a false positive:
//   - Questions at 0.75: 0.04% false-positive rate in the control, versus
//     0.27–0.37% flagged in the affected (topped-up) chapters. The gap is what
//     makes 0.75 defensible — it separates genuine re-asks from question stems
//     that merely share exam phrasing.
//   - Flashcard fronts are short and formulaic ("Define X", "Function of X"),
//     so Dice barely discriminates between distinct cards below 0.85; a lower
//     threshold retires cards that only look alike because of the shared frame.
export const DICE_THRESHOLD_QUESTION = 0.75;
export const DICE_THRESHOLD_FLASHCARD = 0.85;

// Jaccard index over the word sets of the normalised strings:
// |intersection| / |union|. 1 = same words, 0 = no words in common.
export function wordJaccard(a: string, b: string): number {
  const wordsA = new Set(normalise(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalise(b).split(" ").filter(Boolean));
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Second gate, applied on top of the Dice threshold.
//
// Bigram Dice measures character overlap, so it cannot tell a single swapped
// term from a genuine rewording — the two look identical to it. "Define
// mitosis" and "Define meiosis" score 0.769 in Dice: above the question
// threshold, yet they are two valid, distinct cards that both belong in
// Cell/Tissues & Membranes. Dropping one would silently delete real content.
//
// Word-set overlap separates the two cases cleanly. A minimal pair shares only
// the frame and differs in the one word that carries the meaning, so it scores
// around 0.33; a true rewording keeps most of its vocabulary and scores
// 0.60–0.75. Requiring BOTH signals means a pair must be similar in characters
// AND built from substantially the same words before it counts as a duplicate.
export const WORD_JACCARD_MIN = 0.5;

export type DedupeResult<T> = {
  kept: T[];
  dropped_duplicates: number;
};

// Filters `batch` against `existing` stems and against itself. An item is
// dropped when, against any existing stem or any earlier kept item in the
// batch, either:
//   - its normalised key matches exactly, or
//   - its Dice score exceeds `threshold` AND its word-set Jaccard is at least
//     WORD_JACCARD_MIN. Both similarity signals must agree; see the comment on
//     WORD_JACCARD_MIN for why Dice alone drops valid minimal pairs.
//
// The exact normalised-key check is kind-agnostic — an identical stem is a
// duplicate whatever the kind. Only the Dice threshold varies, so `threshold`
// is required: pass DICE_THRESHOLD_QUESTION or DICE_THRESHOLD_FLASHCARD rather
// than letting a default silently apply question semantics to flashcards.
export function filterDuplicates<T>(
  batch: T[],
  getText: (item: T) => string,
  existing: string[],
  threshold: number,
): DedupeResult<T> {
  const seenKeys = new Set<string>(existing.map(normalise));
  const seenTexts = existing.slice();
  const kept: T[] = [];
  let dropped = 0;

  for (const item of batch) {
    const text = getText(item);
    const key = normalise(text);
    const isDuplicate =
      seenKeys.has(key) ||
      seenTexts.some(
        (t) => diceCoefficient(text, t) > threshold && wordJaccard(text, t) >= WORD_JACCARD_MIN,
      );
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
