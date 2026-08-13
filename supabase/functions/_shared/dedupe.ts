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
//
// Thresholds are deliberately conservative. A manual scan of all 87 live
// question pairs scoring above 0.75 found roughly 20 false positives, all of
// one class: identical question templates with a different subject. Examples
// measured on live content — "How is polio primarily transmitted?" vs "How is
// cholera primarily transmitted?" (Dice 0.824, wordJaccard 0.667); "What is the
// causative organism of tetanus?" vs "...of cholera?" (0.825 / 0.750); "The
// elbow joint is classified as which type of synovial joint?" vs "The wrist
// joint..." (0.900 / 0.818, from a control chapter with zero exact
// duplicates). Both metrics score high because the pair differs by a single
// content word, so wordJaccard does not rescue these — it fell below its floor
// on only 2 of the 87 pairs. Every pair above 0.92 in that scan was a genuine
// rewording; the highest-scoring false positive was 0.900.
//
// These filters are a near-verbatim safety net, not a deduplication system.
// String similarity cannot distinguish "same question reworded" from "same
// template, different subject", because that distinction is semantic. Primary
// prevention is the exclusion list injected into the generation prompt. If
// duplication recurs at volume, the fix is semantic — pgvector embeddings on
// stems, or per-item concept keys — not a different threshold.
export const DICE_THRESHOLD_QUESTION = 0.92;
// Flashcards need an even stricter floor than questions. A manual scan of all
// 150 live flashcard pairs scoring 0.85+ found false positives as high as
// 0.968: "What are the key features of IgM?" vs "...IgG?" (Dice 0.968,
// wordJaccard 0.75); "too hot" vs "too cold" (0.940 / 0.857); "donning" vs
// "doffing sequence for PPE" (0.927 / 0.857). Roughly 30% of pairs above 0.90
// were legitimate, distinct cards. Flashcard fronts are short enough that a
// single swapped term barely moves either metric, so no threshold below
// near-identity is safe. The exact normalised-key check remains the primary
// catch; this filter only catches punctuation- and article-level restatements.
export const DICE_THRESHOLD_FLASHCARD = 0.97;

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
// mitosis" and "Define meiosis" score 0.769 in Dice, yet they are two valid,
// distinct cards that both belong in Cell/Tissues & Membranes. Dropping one
// would silently delete real content.
//
// Word-set overlap catches the subset of those pairs that differ in a short
// stem, where the swapped word is a large share of the text: a minimal pair
// like mitosis/meiosis scores around 0.33, while a true rewording keeps most
// of its vocabulary and scores 0.60–0.75. Requiring BOTH signals means a pair
// must be similar in characters AND built from substantially the same words.
//
// This is a secondary guard, not the main defence. On longer stems the swapped
// word is a small share of the words, so a template-swap pair still scores
// well above this floor — in the 87-pair scan above, wordJaccard fell below it
// on only 2 pairs. The conservative Dice threshold is what does the work.
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
