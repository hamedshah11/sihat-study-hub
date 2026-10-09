import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FOUNDING_PARTNER } from "@/lib/brand";
import {
  buildSnapshot,
  type ProgressSnapshot,
  type RawChapter,
  type RawProgress,
  type RawQuizAttempt,
  type RawReview,
  type RawSubject,
} from "@/lib/progress-snapshot";

// One read for everything the student's own screens show about progress:
// the rose, mastery per subject and chapter, today's session, days in a row.
// It runs on the server so a phone on mobile data downloads a few kilobytes
// instead of every card, review and quiz row. Read-only; the user id comes
// from the verified session and every query is filtered by it.

export type StudentContext = {
  firstName: string;
  displayName: string;
  initial: string;
  batchId: string | null;
  batchName: string | null;
  programmeName: string | null;
  semesterName: string | null;
  college: string;
};

export type EarlierSubject = { id: string; name: string; colour: string | null; semesterName: string };

export type ProgressPayload = ProgressSnapshot & {
  student: StudentContext;
  /** Subjects from semesters already finished, for revision. */
  earlierSubjects: EarlierSubject[];
};

async function loadEarlierSubjects(
  programId: string | null,
  currentSemesterId: string | null,
): Promise<EarlierSubject[]> {
  if (!programId || !currentSemesterId) return [];
  const { data: semesters } = await supabaseAdmin
    .from("semesters")
    .select("id, name, number")
    .eq("program_id", programId);
  const current = (semesters ?? []).find((s) => s.id === currentSemesterId);
  const earlier = (semesters ?? []).filter((s) => current && s.number < current.number);
  if (earlier.length === 0) return [];
  const { data: subjects } = await supabaseAdmin
    .from("subjects")
    .select("id, name, colour, display_order, semester_id")
    .in(
      "semester_id",
      earlier.map((s) => s.id),
    );
  const nameOf = new Map(earlier.map((s) => [s.id, s.name]));
  const numberOf = new Map(earlier.map((s) => [s.id, s.number]));
  return (subjects ?? [])
    .sort(
      (a, b) =>
        (numberOf.get(a.semester_id ?? "") ?? 0) - (numberOf.get(b.semester_id ?? "") ?? 0) ||
        (a.display_order ?? 0) - (b.display_order ?? 0),
    )
    .map((s) => ({
      id: s.id,
      name: s.name,
      colour: s.colour,
      semesterName: nameOf.get(s.semester_id ?? "") ?? "",
    }));
}

const PAGE = 1000;

/** PostgREST caps responses at 1,000 rows; page through bigger reads. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 20_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function chunks<T>(items: T[], size = 300): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadSemesterSubjects(batchSemesterId: string | null): Promise<RawSubject[]> {
  if (batchSemesterId) {
    const { data, error } = await supabaseAdmin
      .from("subjects")
      .select("id, name, colour, display_order")
      .eq("semester_id", batchSemesterId);
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  // No batch yet: show the earliest semester that has published content.
  const { data: semesters } = await supabaseAdmin.from("semesters").select("id, number");
  const { data: subjects } = await supabaseAdmin
    .from("subjects")
    .select("id, name, colour, display_order, semester_id");
  const { data: published } = await supabaseAdmin
    .from("chapters")
    .select("subject_id")
    .eq("status", "published");
  const withContent = new Set((published ?? []).map((c) => c.subject_id));
  const numberOf = new Map((semesters ?? []).map((s) => [s.id, s.number]));
  const candidates = (subjects ?? []).filter((s) => withContent.has(s.id));
  if (candidates.length === 0) return [];
  const lowest = Math.min(...candidates.map((s) => numberOf.get(s.semester_id ?? "") ?? 99));
  return candidates.filter((s) => (numberOf.get(s.semester_id ?? "") ?? 99) === lowest);
}

export const getProgressSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProgressPayload> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, batch_id")
      .eq("id", userId)
      .maybeSingle();

    let batch: { name: string; current_semester_id: string | null; program_id: string | null } | null =
      null;
    if (profile?.batch_id) {
      const { data } = await supabaseAdmin
        .from("batches")
        .select("name, current_semester_id, program_id")
        .eq("id", profile.batch_id)
        .maybeSingle();
      batch = data ?? null;
    }
    const [{ data: semester }, { data: programme }] = await Promise.all([
      batch?.current_semester_id
        ? supabaseAdmin.from("semesters").select("name").eq("id", batch.current_semester_id).maybeSingle()
        : Promise.resolve({ data: null }),
      batch?.program_id
        ? supabaseAdmin.from("programs").select("name").eq("id", batch.program_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const [subjects, earlierSubjects] = await Promise.all([
      loadSemesterSubjects(batch?.current_semester_id ?? null),
      loadEarlierSubjects(batch?.program_id ?? null, batch?.current_semester_id ?? null),
    ]);
    const subjectIds = subjects.map((s) => s.id);

    const chapters: RawChapter[] = subjectIds.length
      ? await fetchAll<RawChapter>((from, to) =>
          supabaseAdmin
            .from("chapters")
            .select("id, title, subject_id, display_order")
            .in("subject_id", subjectIds)
            .eq("status", "published")
            .order("display_order", { ascending: true })
            .range(from, to) as never,
        )
      : [];
    const chapterIds = chapters.map((c) => c.id);

    const cards: { id: string; chapter_id: string }[] = [];
    const questionCounts = new Map<string, number>();
    for (const ids of chunks(chapterIds)) {
      const [chapterCards, questions] = await Promise.all([
        fetchAll<{ id: string; chapter_id: string }>((from, to) =>
          supabaseAdmin
            .from("flashcards")
            .select("id, chapter_id")
            .in("chapter_id", ids)
            .eq("status", "approved")
            .range(from, to) as never,
        ),
        fetchAll<{ chapter_id: string }>((from, to) =>
          supabaseAdmin
            .from("questions")
            .select("chapter_id")
            .in("chapter_id", ids)
            .eq("status", "approved")
            .range(from, to) as never,
        ),
      ]);
      cards.push(...chapterCards);
      for (const q of questions) {
        questionCounts.set(q.chapter_id, (questionCounts.get(q.chapter_id) ?? 0) + 1);
      }
    }

    const [reviews, progress, quizAttempts, streakResult, activity] = await Promise.all([
      fetchAll<RawReview>((from, to) =>
        supabaseAdmin
          .from("flashcard_reviews")
          .select(
            "flashcard_id, reps, lapses, state, stability, difficulty, scheduled_days, elapsed_days, learning_steps, last_review, due_at, next_review_at",
          )
          .eq("user_id", userId)
          .range(from, to) as never,
      ),
      fetchAll<RawProgress>((from, to) =>
        supabaseAdmin
          .from("chapter_progress")
          .select("chapter_id, mastery_score, attempts, last_attempt_at")
          .eq("user_id", userId)
          .range(from, to) as never,
      ),
      fetchAll<RawQuizAttempt>((from, to) =>
        supabaseAdmin
          .from("quiz_attempts")
          .select("chapter_id, attempted_at")
          .eq("user_id", userId)
          .range(from, to) as never,
      ),
      supabaseAdmin
        .from("streaks")
        .select("current_streak, longest_streak, last_active_date, freezes_available")
        .eq("user_id", userId)
        .maybeSingle(),
      fetchAll<{ occurred_at: string }>(
        (from, to) =>
          supabaseAdmin
            .from("xp_events")
            .select("occurred_at")
            .eq("user_id", userId)
            .order("occurred_at", { ascending: false })
            .range(from, to) as never,
        10_000,
      ),
    ]);

    const snapshot = buildSnapshot({
      subjects,
      chapters,
      cards,
      questionCounts,
      reviews,
      progress,
      quizAttempts,
      streak: streakResult.data ?? null,
      activityAt: activity.map((a) => a.occurred_at),
    });

    const displayName = profile?.display_name?.trim() || "";
    const firstName = displayName.split(/\s+/)[0] || "there";
    return {
      ...snapshot,
      earlierSubjects,
      student: {
        firstName,
        displayName,
        initial: (displayName[0] ?? "?").toUpperCase(),
        batchId: profile?.batch_id ?? null,
        batchName: batch?.name ?? null,
        programmeName: programme?.name ?? null,
        semesterName: semester?.name ?? null,
        college: FOUNDING_PARTNER.display,
      },
    };
  });
