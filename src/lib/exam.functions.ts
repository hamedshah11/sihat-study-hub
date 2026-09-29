import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { XP_AMOUNTS, insertXp, bumpStreak, startOfTodayPkt } from "@/lib/activity.server";
import {
  DIFFICULTY_MIX,
  EXAM_GRACE_SECONDS,
  EXAM_MIN_QUESTIONS,
  EXAM_MODES,
  EXAM_PASS_MARK,
  type ExamMode,
} from "@/lib/exam-config";

// Exam mode: timed, subject-wide MCQ papers with no feedback until the end.
//
// Everything that matters happens here, with the service-role client:
//   - startExam picks the questions and fixes the deadline, and sends the
//     questions to the browser WITHOUT correct_index or explanations.
//   - submitExam grades the raw selections against the answer key, computes
//     the per-chapter breakdown and awards XP. The client's idea of its score
//     is never trusted.
// exam_attempts is read-only from the browser (see the exam_attempts migration).

type Difficulty = "easy" | "medium" | "hard";

type PoolQuestion = {
  id: string;
  chapter_id: string;
  prompt: string;
  options: string[];
  difficulty: Difficulty;
};

export type ExamQuestion = {
  id: string;
  chapterId: string;
  prompt: string;
  options: string[];
};

export type ExamPayload = {
  attemptId: string;
  subjectId: string;
  mode: ExamMode;
  startedAt: string;
  expiresAt: string;
  durationSeconds: number;
  chapters: { id: string; title: string }[];
  questions: ExamQuestion[];
};

export type ExamReviewQuestion = ExamQuestion & {
  correctIndex: number;
  explanation: string | null;
  selectedIndex: number | null;
  correct: boolean;
  flagged: boolean;
};

export type ExamResult = {
  attemptId: string;
  subjectId: string;
  mode: ExamMode;
  score: number;
  total: number;
  answered: number;
  pct: number;
  passed: boolean;
  late: boolean;
  startedAt: string;
  submittedAt: string;
  timeTakenSeconds: number;
  xpAwarded: number;
  breakdown: { chapterId: string; title: string; correct: number; total: number }[];
  questions: ExamReviewQuestion[];
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toOptions(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((o) => String(o)) : [];
}

function toDifficulty(raw: unknown): Difficulty {
  return raw === "easy" || raw === "hard" ? raw : "medium";
}

/**
 * Split `total` across chapters as evenly as their question pools allow.
 * A chapter that runs short gives its unused share to chapters with spare
 * questions, so the exam still reaches `total` when the bank is big enough.
 */
function allocateQuotas(available: Map<string, number>, total: number): Map<string, number> {
  const quotas = new Map<string, number>();
  for (const id of available.keys()) quotas.set(id, 0);
  let remaining = Math.min(
    total,
    [...available.values()].reduce((a, b) => a + b, 0),
  );
  // Round-robin one question at a time, in random chapter order, so leftovers
  // don't always land on the first chapters.
  const order = shuffle([...available.keys()]);
  while (remaining > 0) {
    let progressed = false;
    for (const id of order) {
      if (remaining === 0) break;
      const q = quotas.get(id)!;
      if (q < available.get(id)!) {
        quotas.set(id, q + 1);
        remaining--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return quotas;
}

/** Pick `n` questions from one chapter, following DIFFICULTY_MIX where possible. */
function pickFromChapter(pool: PoolQuestion[], n: number): PoolQuestion[] {
  const buckets: Record<Difficulty, PoolQuestion[]> = {
    easy: shuffle(pool.filter((q) => q.difficulty === "easy")),
    medium: shuffle(pool.filter((q) => q.difficulty === "medium")),
    hard: shuffle(pool.filter((q) => q.difficulty === "hard")),
  };
  const picked: PoolQuestion[] = [];
  const targets: [Difficulty, number][] = [
    ["hard", Math.round(n * DIFFICULTY_MIX.hard)],
    ["easy", Math.round(n * DIFFICULTY_MIX.easy)],
  ];
  for (const [level, count] of targets) {
    picked.push(...buckets[level].splice(0, Math.min(count, n - picked.length)));
  }
  // Medium takes the rest; if any level ran short, top up from whatever is left.
  picked.push(...buckets.medium.splice(0, n - picked.length));
  const leftovers = shuffle([...buckets.easy, ...buckets.medium, ...buckets.hard]);
  picked.push(...leftovers.slice(0, n - picked.length));
  return picked;
}

async function loadChapters(subjectId: string, onlyIds?: string[]) {
  const { data, error } = await supabaseAdmin
    .from("chapters")
    .select("id, title, display_order")
    .eq("subject_id", subjectId)
    .eq("status", "published")
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  const chapters = (data ?? []).map((c) => ({ id: c.id as string, title: c.title as string }));
  if (!onlyIds || onlyIds.length === 0) return chapters;
  const wanted = new Set(onlyIds);
  return chapters.filter((c) => wanted.has(c.id));
}

async function buildPayload(attempt: {
  id: string;
  subject_id: string;
  mode: string;
  started_at: string;
  expires_at: string;
  duration_seconds: number;
  chapter_ids: string[];
  question_ids: string[];
}): Promise<ExamPayload> {
  const [chapters, { data: rows, error }] = await Promise.all([
    loadChapters(attempt.subject_id, attempt.chapter_ids),
    supabaseAdmin
      .from("questions")
      .select("id, chapter_id, prompt, options")
      .in("id", attempt.question_ids),
  ]);
  if (error) throw new Error(error.message);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  // Keep the order fixed at start time, and never include the answer key.
  const questions: ExamQuestion[] = attempt.question_ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      id: r.id as string,
      chapterId: r.chapter_id as string,
      prompt: r.prompt as string,
      options: toOptions(r.options),
    }));
  return {
    attemptId: attempt.id,
    subjectId: attempt.subject_id,
    mode: attempt.mode as ExamMode,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    durationSeconds: attempt.duration_seconds,
    chapters,
    questions,
  };
}

const ATTEMPT_COLUMNS =
  "id, user_id, subject_id, mode, started_at, expires_at, duration_seconds, chapter_ids, question_ids, submitted_at, score, total_questions, answers, chapter_breakdown, flagged_ids";

// ---------------------------------------------------------------------------
// getExamOverview — what the exam setup screen needs: chapters with their
// question counts, any in-progress attempt, and recent results.
// ---------------------------------------------------------------------------

export const getExamOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ subjectId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const chapters = await loadChapters(data.subjectId);
    const counts = new Map<string, number>();
    if (chapters.length) {
      const { data: qs, error } = await supabaseAdmin
        .from("questions")
        .select("chapter_id")
        .in(
          "chapter_id",
          chapters.map((c) => c.id),
        )
        .eq("status", "approved");
      if (error) throw new Error(error.message);
      for (const q of qs ?? []) {
        const id = q.chapter_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    const { data: attempts } = await supabaseAdmin
      .from("exam_attempts")
      .select("id, mode, started_at, expires_at, submitted_at, score, total_questions")
      .eq("user_id", userId)
      .eq("subject_id", data.subjectId)
      .order("started_at", { ascending: false })
      .limit(20);

    const active = (attempts ?? []).find((a) => !a.submitted_at) ?? null;
    const history = (attempts ?? [])
      .filter((a) => a.submitted_at)
      .map((a) => ({
        id: a.id as string,
        mode: a.mode as ExamMode,
        submittedAt: a.submitted_at as string,
        score: a.score ?? 0,
        total: a.total_questions,
      }));

    return {
      chapters: chapters.map((c) => ({ ...c, questionCount: counts.get(c.id) ?? 0 })),
      active: active
        ? {
            id: active.id as string,
            mode: active.mode as ExamMode,
            expiresAt: active.expires_at as string,
          }
        : null,
      history,
    };
  });

// ---------------------------------------------------------------------------
// startExam — choose the paper and fix the deadline. If the student already
// has an unfinished exam in this subject, that one is returned instead, so a
// student can't keep restarting to fish for easier questions.
// ---------------------------------------------------------------------------

const StartExamInput = z.object({
  subjectId: z.string().uuid(),
  mode: z.enum(["quick", "full"]),
  chapterIds: z.array(z.string().uuid()).max(100).optional(),
});

export const startExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StartExamInput.parse(data))
  .handler(async ({ data, context }): Promise<ExamPayload> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const { data: existing } = await supabaseAdmin
      .from("exam_attempts")
      .select(ATTEMPT_COLUMNS)
      .eq("user_id", userId)
      .eq("subject_id", data.subjectId)
      .is("submitted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return buildPayload(existing);

    const chapters = await loadChapters(data.subjectId, data.chapterIds);
    if (chapters.length === 0) throw new Error("No published chapters selected.");

    const { data: rows, error } = await supabaseAdmin
      .from("questions")
      .select("id, chapter_id, prompt, options, difficulty")
      .in(
        "chapter_id",
        chapters.map((c) => c.id),
      )
      .eq("status", "approved");
    if (error) throw new Error(error.message);

    const pool: PoolQuestion[] = (rows ?? [])
      .map((r) => ({
        id: r.id as string,
        chapter_id: r.chapter_id as string,
        prompt: r.prompt as string,
        options: toOptions(r.options),
        difficulty: toDifficulty(r.difficulty),
      }))
      .filter((q) => q.options.length >= 2);

    if (pool.length < EXAM_MIN_QUESTIONS) {
      throw new Error(
        `Not enough questions yet for an exam (${pool.length} available, ${EXAM_MIN_QUESTIONS} needed).`,
      );
    }

    const byChapter = new Map<string, PoolQuestion[]>();
    for (const q of pool) {
      const list = byChapter.get(q.chapter_id) ?? [];
      list.push(q);
      byChapter.set(q.chapter_id, list);
    }
    const config = EXAM_MODES[data.mode];
    const quotas = allocateQuotas(
      new Map([...byChapter].map(([id, qs]) => [id, qs.length])),
      config.questions,
    );
    const picked = shuffle(
      [...byChapter].flatMap(([id, qs]) => pickFromChapter(qs, quotas.get(id) ?? 0)),
    );

    const durationSeconds = config.minutes * 60;
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationSeconds * 1000);

    const { data: attempt, error: insErr } = await supabaseAdmin
      .from("exam_attempts")
      .insert({
        user_id: userId,
        subject_id: data.subjectId,
        mode: data.mode,
        chapter_ids: chapters.map((c) => c.id),
        question_ids: picked.map((q) => q.id),
        duration_seconds: durationSeconds,
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        total_questions: picked.length,
      })
      .select(ATTEMPT_COLUMNS)
      .single();
    if (insErr || !attempt) throw new Error(insErr?.message ?? "Could not start exam");

    return buildPayload(attempt);
  });

// ---------------------------------------------------------------------------
// resumeExam — reload an unfinished exam (after a refresh or dropped signal).
// ---------------------------------------------------------------------------

export const resumeExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ attemptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ExamPayload> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const { data: attempt } = await supabaseAdmin
      .from("exam_attempts")
      .select(ATTEMPT_COLUMNS)
      .eq("id", data.attemptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!attempt) throw new Error("Exam not found");
    if (attempt.submitted_at) throw new Error("This exam has already been submitted.");
    return buildPayload(attempt);
  });

// ---------------------------------------------------------------------------
// Grading + results
// ---------------------------------------------------------------------------

type StoredAnswer = {
  questionId: string;
  chapterId: string;
  selectedIndex: number | null;
  correct: boolean;
};

async function buildResult(
  attempt: {
    id: string;
    subject_id: string;
    mode: string;
    started_at: string;
    expires_at: string;
    submitted_at: string | null;
    chapter_ids: string[];
    question_ids: string[];
    answers: unknown;
    flagged_ids: string[] | null;
  },
  xpAwarded: number,
): Promise<ExamResult> {
  const [chapters, { data: rows, error }] = await Promise.all([
    loadChapters(attempt.subject_id, attempt.chapter_ids),
    supabaseAdmin
      .from("questions")
      .select("id, chapter_id, prompt, options, correct_index, explanation")
      .in("id", attempt.question_ids),
  ]);
  if (error) throw new Error(error.message);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  const answers = (Array.isArray(attempt.answers) ? attempt.answers : []) as StoredAnswer[];
  const answerById = new Map(answers.map((a) => [a.questionId, a]));
  const flagged = new Set(attempt.flagged_ids ?? []);

  const questions: ExamReviewQuestion[] = attempt.question_ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => {
      const a = answerById.get(r.id as string);
      return {
        id: r.id as string,
        chapterId: r.chapter_id as string,
        prompt: r.prompt as string,
        options: toOptions(r.options),
        correctIndex: r.correct_index as number,
        explanation: (r.explanation as string | null) ?? null,
        selectedIndex: a?.selectedIndex ?? null,
        correct: a?.correct ?? false,
        flagged: flagged.has(r.id as string),
      };
    });

  const titleById = new Map(chapters.map((c) => [c.id, c.title]));
  const tally = new Map<string, { correct: number; total: number }>();
  for (const q of questions) {
    const t = tally.get(q.chapterId) ?? { correct: 0, total: 0 };
    t.total++;
    if (q.correct) t.correct++;
    tally.set(q.chapterId, t);
  }
  // Chapter order follows the syllabus, not the shuffled question order.
  const breakdown = chapters
    .filter((c) => tally.has(c.id))
    .map((c) => ({
      chapterId: c.id,
      title: titleById.get(c.id) ?? "Chapter",
      ...tally.get(c.id)!,
    }));

  const score = questions.filter((q) => q.correct).length;
  const total = questions.length;
  const submittedAt = attempt.submitted_at ?? new Date().toISOString();
  const pct = total ? Math.round((score / total) * 100) : 0;
  return {
    attemptId: attempt.id,
    subjectId: attempt.subject_id,
    mode: attempt.mode as ExamMode,
    score,
    total,
    answered: questions.filter((q) => q.selectedIndex !== null).length,
    pct,
    passed: total > 0 && score / total >= EXAM_PASS_MARK,
    late:
      new Date(submittedAt).getTime() >
      new Date(attempt.expires_at).getTime() + EXAM_GRACE_SECONDS * 1000,
    startedAt: attempt.started_at,
    submittedAt,
    timeTakenSeconds: Math.max(
      0,
      Math.round(
        (Math.min(new Date(submittedAt).getTime(), new Date(attempt.expires_at).getTime()) -
          new Date(attempt.started_at).getTime()) /
          1000,
      ),
    ),
    xpAwarded,
    breakdown,
    questions,
  };
}

const SubmitExamInput = z.object({
  attemptId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedIndex: z.number().int().min(0).max(9).nullable(),
      }),
    )
    .max(200),
  flaggedIds: z.array(z.string().uuid()).max(200).default([]),
});

export const submitExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SubmitExamInput.parse(data))
  .handler(async ({ data, context }): Promise<ExamResult> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const { data: attempt } = await supabaseAdmin
      .from("exam_attempts")
      .select(ATTEMPT_COLUMNS)
      .eq("id", data.attemptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!attempt) throw new Error("Exam not found");

    // Already submitted (double tap, retry after a timeout): return the stored
    // result rather than grading or awarding XP twice.
    if (attempt.submitted_at) return buildResult(attempt, 0);

    const inPaper = new Set(attempt.question_ids);
    const selections = new Map<string, number | null>();
    for (const a of data.answers) {
      if (inPaper.has(a.questionId) && !selections.has(a.questionId)) {
        selections.set(a.questionId, a.selectedIndex);
      }
    }

    // Authoritative answer key. Status is not filtered: a question retired
    // mid-exam is still graded as it was shown.
    const { data: keyRows, error } = await supabaseAdmin
      .from("questions")
      .select("id, chapter_id, correct_index")
      .in("id", attempt.question_ids);
    if (error) throw new Error(error.message);

    const graded: StoredAnswer[] = (keyRows ?? []).map((r) => {
      const selectedIndex = selections.get(r.id as string) ?? null;
      return {
        questionId: r.id as string,
        chapterId: r.chapter_id as string,
        selectedIndex,
        correct: selectedIndex !== null && selectedIndex === r.correct_index,
      };
    });
    const score = graded.filter((g) => g.correct).length;
    const total = graded.length;

    const breakdownMap = new Map<string, { correct: number; total: number }>();
    for (const g of graded) {
      const t = breakdownMap.get(g.chapterId) ?? { correct: 0, total: 0 };
      t.total++;
      if (g.correct) t.correct++;
      breakdownMap.set(g.chapterId, t);
    }

    const submittedAt = new Date().toISOString();
    const flaggedIds = data.flaggedIds.filter((id) => inPaper.has(id));

    // Conditional on submitted_at still being null, so two racing submits
    // can't both be recorded.
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("exam_attempts")
      .update({
        submitted_at: submittedAt,
        score,
        total_questions: total,
        answers: graded as never,
        chapter_breakdown: [...breakdownMap].map(([chapterId, t]) => ({
          chapterId,
          ...t,
        })) as never,
        flagged_ids: flaggedIds,
      })
      .eq("id", attempt.id)
      .is("submitted_at", null)
      .select(ATTEMPT_COLUMNS)
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);
    if (!updated) {
      const { data: again } = await supabaseAdmin
        .from("exam_attempts")
        .select(ATTEMPT_COLUMNS)
        .eq("id", attempt.id)
        .single();
      return buildResult(again!, 0);
    }

    // XP once per subject per PKT day, so exams can't be farmed. Only a
    // genuine attempt counts: at least half the paper answered.
    let xpAwarded = 0;
    const answeredCount = graded.filter((g) => g.selectedIndex !== null).length;
    if (total > 0 && answeredCount >= total / 2) {
      const { count } = await supabaseAdmin
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("subject_id", attempt.subject_id)
        .gte("submitted_at", startOfTodayPkt())
        .neq("id", attempt.id);
      if ((count ?? 0) === 0) {
        const source = score / total >= EXAM_PASS_MARK ? "exam_pass" : "exam";
        await insertXp(userId, source);
        xpAwarded = XP_AMOUNTS[source];
      }
    }
    await bumpStreak(userId);

    return buildResult(updated, xpAwarded);
  });

// ---------------------------------------------------------------------------
// getExamResult — full review of a past, submitted exam.
// ---------------------------------------------------------------------------

export const getExamResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ attemptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ExamResult> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const { data: attempt } = await supabaseAdmin
      .from("exam_attempts")
      .select(ATTEMPT_COLUMNS)
      .eq("id", data.attemptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!attempt) throw new Error("Exam not found");
    if (!attempt.submitted_at) throw new Error("This exam hasn't been submitted yet.");
    return buildResult(attempt, 0);
  });
