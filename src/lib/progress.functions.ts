import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FOUNDING_PARTNER } from "@/lib/brand";
import {
  buildSnapshot,
  countByChapter,
  earlierSubjectsFrom,
  earliestSemesterSubjects,
  type EarlierSubject,
  type ProgrammeSemester,
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

export type { EarlierSubject };

export type ProgressPayload = ProgressSnapshot & {
  student: StudentContext;
  /** Subjects from semesters already finished, for revision. */
  earlierSubjects: EarlierSubject[];
};

const PAGE = 1000;

/** PostgREST caps responses at 1,000 rows; page through bigger reads. */
async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
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

// The student's profile, batch and the curriculum the screens show, in one
// read: semester and programme names, this semester's subjects with their
// published chapters in teaching order, and the programme's semesters (for
// revision subjects from earlier ones).
const PROFILE_AND_CURRICULUM = `display_name, batch_id, batches(
  name, current_semester_id, program_id,
  semesters(name, subjects(id, name, colour, display_order,
    chapters(id, title, subject_id, display_order))),
  programs(name, semesters(id, name, number,
    subjects(id, name, colour, display_order, semester_id)))
)`.replace(/\s+/g, "");

type ProfileAndCurriculum = {
  display_name: string | null;
  batch_id: string | null;
  batches: {
    name: string;
    current_semester_id: string | null;
    program_id: string | null;
    semesters: { name: string; subjects: (RawSubject & { chapters: RawChapter[] })[] } | null;
    programs: { name: string; semesters: ProgrammeSemester[] } | null;
  } | null;
};

async function readProfileAndCurriculum(userId: string): Promise<ProfileAndCurriculum | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_AND_CURRICULUM)
    .eq("id", userId)
    .eq("batches.semesters.subjects.chapters.status", "published")
    .order("display_order", {
      referencedTable: "batches.semesters.subjects.chapters",
      ascending: true,
    })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as ProfileAndCurriculum | null;
}

/** No batch yet: the earliest semester that has published content. */
async function loadEarliestCurriculum(): Promise<{
  subjects: RawSubject[];
  chapters: RawChapter[];
}> {
  const [{ data: semesters }, { data: allSubjects }, { data: published }] = await Promise.all([
    supabaseAdmin.from("semesters").select("id, number"),
    supabaseAdmin.from("subjects").select("id, name, colour, display_order, semester_id"),
    supabaseAdmin.from("chapters").select("subject_id").eq("status", "published"),
  ]);
  const subjects = earliestSemesterSubjects(semesters ?? [], allSubjects ?? [], published ?? []);
  const subjectIds = subjects.map((s) => s.id);
  const chapters: RawChapter[] = subjectIds.length
    ? await fetchAll<RawChapter>(
        (from, to) =>
          supabaseAdmin
            .from("chapters")
            .select("id, title, subject_id, display_order")
            .in("subject_id", subjectIds)
            .eq("status", "published")
            .order("display_order", { ascending: true })
            .range(from, to) as never,
      )
    : [];
  return { subjects, chapters };
}

/** Approved cards and question counts for the chapters, all chunks at once. */
async function loadCardsAndQuestions(chapterIds: string[]) {
  const perChunk = await Promise.all(
    chunks(chapterIds).map((ids) =>
      Promise.all([
        fetchAll<{ id: string; chapter_id: string }>(
          (from, to) =>
            supabaseAdmin
              .from("flashcards")
              .select("id, chapter_id")
              .in("chapter_id", ids)
              .eq("status", "approved")
              .range(from, to) as never,
        ),
        fetchAll<{ chapter_id: string }>(
          (from, to) =>
            supabaseAdmin
              .from("questions")
              .select("chapter_id")
              .in("chapter_id", ids)
              .eq("status", "approved")
              .range(from, to) as never,
        ),
      ]),
    ),
  );
  return {
    cards: perChunk.flatMap(([cards]) => cards),
    questionCounts: countByChapter(perChunk.flatMap(([, questions]) => questions)),
  };
}

export const getProgressSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProgressPayload> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    // The student's own rows don't depend on the curriculum lookups below, so
    // they load at the same time instead of after them. This is the read the
    // session-complete rose waits for.
    const userReads = Promise.all([
      fetchAll<RawReview>(
        (from, to) =>
          supabaseAdmin
            .from("flashcard_reviews")
            .select(
              "flashcard_id, reps, lapses, state, stability, difficulty, scheduled_days, elapsed_days, learning_steps, last_review, due_at, next_review_at",
            )
            .eq("user_id", userId)
            .range(from, to) as never,
      ),
      fetchAll<RawProgress>(
        (from, to) =>
          supabaseAdmin
            .from("chapter_progress")
            .select("chapter_id, mastery_score, attempts, last_attempt_at")
            .eq("user_id", userId)
            .range(from, to) as never,
      ),
      fetchAll<RawQuizAttempt>(
        (from, to) =>
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

    // Rejections surface at the await below; this stops an early curriculum
    // error from leaving this promise's failure unhandled.
    userReads.catch(() => undefined);

    const profile = await readProfileAndCurriculum(userId);
    const batch = profile?.batches ?? null;
    const semesterId = batch?.current_semester_id ?? null;

    let subjects: RawSubject[];
    let chapters: RawChapter[];
    if (semesterId) {
      const semesterSubjects = batch?.semesters?.subjects ?? [];
      subjects = semesterSubjects.map(({ id, name, colour, display_order }) => ({
        id,
        name,
        colour,
        display_order,
      }));
      chapters = semesterSubjects.flatMap((subject) => subject.chapters);
    } else {
      ({ subjects, chapters } = await loadEarliestCurriculum());
    }
    const earlierSubjects = earlierSubjectsFrom(batch?.programs?.semesters ?? [], semesterId);

    const { cards, questionCounts } = await loadCardsAndQuestions(chapters.map((c) => c.id));

    const [reviews, progress, quizAttempts, streakResult, activity] = await userReads;

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
        programmeName: batch?.programs?.name ?? null,
        semesterName: batch?.semesters?.name ?? null,
        college: FOUNDING_PARTNER.display,
      },
    };
  });
