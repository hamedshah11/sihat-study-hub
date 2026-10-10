// Finds the passage of a chapter's notes that best matches a question, so a
// reviewer sees the evidence beside each AI draft. This is a match against
// the approved notes, not stored provenance: generate-content doesn't record
// which passage a draft came from yet.

const STOP = new Set(
  "the a an and or of to in on for is are was were be by with as at from that this these those which what why how when does do can may not but it its into than then also only".split(
    " ",
  ),
);

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%°\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export type SourceMatch = {
  heading: string | null;
  paragraphIndex: number;
  text: string;
  /** Words shared with the question and its correct answer, for highlighting. */
  terms: string[];
};

export function findSourcePassage(notesMd: string | null, query: string): SourceMatch | null {
  if (!notesMd?.trim()) return null;
  const want = new Set(words(query));
  if (want.size === 0) return null;
  let heading: string | null = null;
  let paragraphInSection = 0;
  let best: (SourceMatch & { score: number }) | null = null;
  for (const block of notesMd.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    const h = trimmed.match(/^#{1,4}\s+(.+?)\s*#*$/);
    if (h) {
      heading = h[1].trim();
      paragraphInSection = 0;
      continue;
    }
    if (!trimmed) continue;
    paragraphInSection += 1;
    const plain = trimmed.replace(/^[>*\-\s]+/gm, "").replace(/\*\*|__|`/g, "");
    const have = words(plain);
    const shared = [...new Set(have.filter((w) => want.has(w)))];
    const score = shared.length / Math.sqrt(Math.max(8, have.length));
    if (shared.length >= 2 && (!best || score > best.score)) {
      best = { heading, paragraphIndex: paragraphInSection, text: plain, terms: shared, score };
    }
  }
  if (!best) return null;
  const { score: _score, ...match } = best;
  return match;
}

/** Split text into plain and highlighted parts for the matched terms. */
export function highlightParts(text: string, terms: string[]) {
  if (terms.length === 0) return [{ text, hit: false }];
  const pattern = new RegExp(
    `\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\w*`,
    "gi",
  );
  const parts: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const gap = text.slice(last, m.index);
    const prev = parts.at(-1);
    // Join neighbouring matches ("steam under pressure") into one highlight.
    if (prev?.hit && /^[ \t]+$/.test(gap)) {
      prev.text += gap + m[0];
    } else {
      if (gap) parts.push({ text: gap, hit: false });
      parts.push({ text: m[0], hit: true });
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}
