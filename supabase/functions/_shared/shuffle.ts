export function shuffleOptions<T extends { options: unknown; correct_index: number }>(q: T): T {
  const opts = Array.isArray(q.options) ? (q.options as unknown[]).slice() : [];
  const ci = typeof q.correct_index === "number" ? q.correct_index : 0;
  if (opts.length < 2 || ci < 0 || ci >= opts.length) return q;
  // tag the correct option so duplicate option text can't break the mapping
  const tagged = opts.map((text, i) => ({ text, correct: i === ci }));
  for (let i = tagged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
  }
  return {
    ...q,
    options: tagged.map((t) => t.text),
    correct_index: tagged.findIndex((t) => t.correct),
  };
}
