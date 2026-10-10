// The parts of the Batch tab (batch.functions.ts) that turn rows into what
// students see, kept pure so they can be unit-tested. Only totals and
// opted-in first names come out of here.

export type CircleMember = { firstName: string; studiedToday: boolean | null; isMe: boolean };

/**
 * The subject the batch's average quiz mastery is lowest in, once at least
 * three students have data in it and at least two subjects can be compared.
 */
export function hardestSubjectFrom(
  subjects: { id: string; name: string }[],
  chapters: { id: string; subject_id: string }[],
  progress: { user_id: string; chapter_id: string; mastery_score: number | null }[],
): string | null {
  const subjectOf = new Map(chapters.map((c) => [c.id, c.subject_id]));
  const bySubject = new Map<string, { sum: number; n: number; students: Set<string> }>();
  for (const p of progress) {
    const sid = subjectOf.get(p.chapter_id);
    if (!sid || p.mastery_score == null) continue;
    const agg = bySubject.get(sid) ?? { sum: 0, n: 0, students: new Set<string>() };
    agg.sum += Number(p.mastery_score);
    agg.n += 1;
    agg.students.add(p.user_id);
    bySubject.set(sid, agg);
  }
  const ranked = [...bySubject.entries()]
    .filter(([, a]) => a.students.size >= 3)
    .map(([sid, a]) => ({ sid, avg: a.sum / a.n }))
    .sort((a, b) => a.avg - b.avg);
  if (ranked.length < 2) return null;
  return subjects.find((s) => s.id === ranked[0].sid)?.name ?? null;
}

/**
 * Circle members in the order they joined, never sorted by activity.
 * "Studied today" is shown only for members who opted in.
 */
export function circleMembersFrom(
  memberIds: string[],
  userId: string,
  profiles: { id: string; display_name: string | null }[],
  settings: { user_id: string; show_in_circles: boolean }[],
  studiedTodayIds: (string | null)[],
): CircleMember[] {
  const nameOf = new Map(
    profiles.map((p) => [p.id, (p.display_name ?? "").trim().split(/\s+/)[0] || "Friend"]),
  );
  const shows = new Set(settings.filter((v) => v.show_in_circles).map((v) => v.user_id));
  const studied = new Set(studiedTodayIds);
  return memberIds.map((id) => ({
    firstName: nameOf.get(id) ?? "Friend",
    studiedToday: shows.has(id) ? studied.has(id) : null,
    isMe: id === userId,
  }));
}
