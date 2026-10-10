import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { schedule, type ReviewState, type Rating } from "@/lib/spacedRepetition";
import { buildHistory, pickQuizQuestions } from "@/lib/mistakes";
import {
  XP_AMOUNTS,
  pakistanDate,
  insertXp,
  bumpStreak,
  readStreak,
  writeStreak,
  startOfTodayPkt,
  logAnswers,
} from "@/lib/activity.server";
import {
  collectAnswers,
  coversIssuedPaper,
  quizXpSource,
  rollingMastery,
} from "@/lib/quiz-grading";

// Why these run server-side with the service-role client:
// XP, streaks, quiz scores and chapter mastery feed the batch totals, the
// exam-readiness signals and the B2B "improves outcomes" story. If the browser
// can write them directly (it could, via the old `auth.uid() = user_id` ALL
// policies), any student can forge them from the devtools console. These
// functions are the ONLY trusted path that writes those tables; a companion
// migration locks the tables to read-only for normal users.
//
// The user id always comes from the verified session (requireSupabaseAuth),
// never from the request body, so a caller cannot write on behalf of another
// user. Scores are recomputed here from the answers — the client's claimed
// score is ignored entirely.

// Chapter mastery is the average of this many most recent quiz attempts.
const MASTERY_WINDOW = 3;
const CHAPTER_QUIZ_SIZE = 5;

export type ChapterQuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  isDueMistake: boolean;
};

// Select the paper on the trusted server so answer keys and the student's
// answer history never need to be downloaded to construct a quiz.
export const getChapterQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ chapterId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const [{ data: questions, error: questionsError }, { data: answerRows, error: answersError }] =
      await Promise.all([
        supabaseAdmin
          .from("questions")
          .select("id, prompt, options")
          .eq("chapter_id", data.chapterId)
          .eq("status", "approved"),
        supabaseAdmin
          .from("question_answers")
          .select("question_id, chapter_id, correct, answered_at")
          .eq("user_id", userId)
          .eq("chapter_id", data.chapterId)
          .order("answered_at", { ascending: false })
          .limit(5000),
      ]);
    if (questionsError) throw new Error(questionsError.message);
    if (answersError) throw new Error(answersError.message);

    const history = buildHistory(answerRows ?? []);
    const picked = pickQuizQuestions(questions ?? [], history, CHAPTER_QUIZ_SIZE);
    let quizId: string | null = null;
    if (picked.length === CHAPTER_QUIZ_SIZE) {
      const { data: session, error: sessionError } = await supabaseAdmin
        .from("quiz_sessions")
        .insert({
          user_id: userId,
          chapter_id: data.chapterId,
          question_ids: picked.map((question) => question.id),
        })
        .select("id")
        .single();
      if (sessionError) throw new Error(sessionError.message);
      quizId = session.id;
    }
    return {
      quizId,
      available: questions?.length ?? 0,
      questions: picked.map((question) => {
        const dueAt = history.get(question.id)?.mistakeDueAt;
        return {
          id: question.id,
          prompt: question.prompt,
          options: Array.isArray(question.options) ? (question.options as string[]) : [],
          isDueMistake: dueAt !== null && dueAt !== undefined && dueAt <= Date.now(),
        } satisfies ChapterQuizQuestion;
      }),
    };
  });

// ---------------------------------------------------------------------------
// checkQuizAnswer — locks one answer on an issued paper and only then reveals
// whether it was right, with the one-line reason (Florence shows a wrong
// answer's correct option straight away). The first answer per question is
// final: it is stored on the quiz session, a later different selection is
// ignored, and submitQuiz grades the locked answers. If the
// quiz_sessions.locked_answers column hasn't been migrated yet this returns
// { available: false } and the client falls back to feedback after submit.
// ---------------------------------------------------------------------------

const CheckAnswerInput = z.object({
  quizId: z.string().uuid(),
  questionId: z.string().uuid(),
  selectedIndex: z.number().int().min(0).max(9),
});

type LockedAnswers = Record<string, number>;

async function readLockedAnswers(sessionId: string): Promise<LockedAnswers | null> {
  const { data, error } = await supabaseAdmin
    .from("quiz_sessions")
    .select("locked_answers" as never)
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return null;
  const value = (data as { locked_answers?: unknown }).locked_answers;
  return value && typeof value === "object" ? (value as LockedAnswers) : {};
}

export const checkQuizAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CheckAnswerInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    // The paper, its locked answers and the question are read together; the
    // checks below run in the same order as before, so nothing about the
    // question leaves the server unless the paper passes all of them.
    const [{ data: session, error: sessionError }, locked, { data: question, error: qErr }] =
      await Promise.all([
        supabaseAdmin
          .from("quiz_sessions")
          .select("id, chapter_id, question_ids, created_at, submitted_at")
          .eq("id", data.quizId)
          .eq("user_id", userId)
          .maybeSingle(),
        readLockedAnswers(data.quizId),
        supabaseAdmin
          .from("questions")
          .select("id, chapter_id, options, correct_index, explanation")
          .eq("id", data.questionId)
          .maybeSingle(),
      ]);
    if (sessionError) throw new Error(sessionError.message);
    if (!session || session.submitted_at) throw new Error("Quiz is no longer available");
    if (Date.now() - Date.parse(session.created_at) > 24 * 60 * 60 * 1000) {
      throw new Error("Quiz has expired. Start another quiz.");
    }
    if (!session.question_ids.includes(data.questionId)) {
      throw new Error("That question isn't part of this quiz");
    }

    if (locked === null) return { available: false as const };

    if (qErr) throw new Error(qErr.message);
    if (!question || question.chapter_id !== session.chapter_id) {
      throw new Error("Question not found");
    }

    const already = locked[data.questionId];
    const selectedIndex = typeof already === "number" ? already : data.selectedIndex;
    const options = Array.isArray(question.options) ? question.options : [];
    if (selectedIndex >= options.length) throw new Error("Invalid answer selection");

    if (typeof already !== "number") {
      const { error: lockError } = await supabaseAdmin
        .from("quiz_sessions")
        .update({ locked_answers: { ...locked, [data.questionId]: selectedIndex } } as never)
        .eq("id", session.id)
        .is("submitted_at", null);
      if (lockError) return { available: false as const };
    }

    return {
      available: true as const,
      selectedIndex,
      correct: selectedIndex === question.correct_index,
      correctIndex: question.correct_index as number,
      explanation: (question.explanation as string | null) ?? null,
    };
  });

// ---------------------------------------------------------------------------
// submitQuiz — grades a quiz attempt server-side and records score, mastery,
// XP and streak. The client sends only its selections; it cannot set the score.
// ---------------------------------------------------------------------------

const SubmitQuizInput = z.object({
  quizId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedIndex: z.number().int().min(0).max(9),
      }),
    )
    .min(1)
    .max(50),
});

export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SubmitQuizInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    // The paper, its locked answers and the answer key for the submitted
    // questions are read together. Every check below still runs, in the same
    // order, before anything is written or revealed.
    const submittedIds = [...new Set(data.answers.map((a) => a.questionId))];
    const [{ data: session, error: sessionError }, lockedAnswers, { data: rows, error: qErr }] =
      await Promise.all([
        supabaseAdmin
          .from("quiz_sessions")
          .select("id, chapter_id, question_ids, created_at, submitted_at")
          .eq("id", data.quizId)
          .eq("user_id", userId)
          .maybeSingle(),
        readLockedAnswers(data.quizId),
        // Authoritative answer key. Status is not filtered: a question retired
        // after the paper was issued is still graded as it was shown.
        supabaseAdmin
          .from("questions")
          .select("id, chapter_id, prompt, options, correct_index, explanation")
          .in("id", submittedIds),
      ]);
    if (sessionError) throw new Error(sessionError.message);
    if (!session || session.submitted_at) throw new Error("Quiz is no longer available");
    if (Date.now() - Date.parse(session.created_at) > 24 * 60 * 60 * 1000) {
      throw new Error("Quiz has expired. Start another quiz.");
    }
    const chapterId = session.chapter_id;
    const issuedIds = session.question_ids;

    const submitted = collectAnswers(data.answers, lockedAnswers ?? {});
    const questionIds = submitted.map((a) => a.questionId);
    if (!coversIssuedPaper(questionIds, issuedIds)) {
      throw new Error("Submit every question from the issued quiz");
    }

    if (qErr) throw new Error(qErr.message);
    const rowById = new Map(
      (rows ?? []).filter((row) => row.chapter_id === chapterId).map((row) => [row.id, row]),
    );
    if (rowById.size !== issuedIds.length) throw new Error("Issued quiz is incomplete");
    for (const answer of submitted) {
      const options = rowById.get(answer.questionId)?.options;
      if (!Array.isArray(options) || answer.selectedIndex >= options.length) {
        throw new Error("Invalid answer selection");
      }
    }

    // Claim the one-time paper before revealing any answer key. The
    // conditional update prevents two racing submissions from both grading.
    // The reads beside it don't depend on it: the chapter's attempts today
    // (read BEFORE this one is saved, to cap XP so a quiz can't be retaken
    // for endless XP), its newest attempts (for mastery), its progress row
    // and the streak.
    const [
      { data: claimed, error: claimError },
      { data: todaysAttempts },
      { data: priorAttempts },
      { data: existing },
      streak,
    ] = await Promise.all([
      supabaseAdmin
        .from("quiz_sessions")
        .update({ submitted_at: new Date().toISOString() })
        .eq("id", session.id)
        .is("submitted_at", null)
        .select("id")
        .maybeSingle(),
      supabaseAdmin
        .from("quiz_attempts")
        .select("score, total_questions")
        .eq("user_id", userId)
        .eq("chapter_id", chapterId)
        .gte("attempted_at", startOfTodayPkt()),
      supabaseAdmin
        .from("quiz_attempts")
        .select("score, total_questions, attempted_at")
        .eq("user_id", userId)
        .eq("chapter_id", chapterId)
        .order("attempted_at", { ascending: false })
        .limit(MASTERY_WINDOW),
      supabaseAdmin
        .from("chapter_progress")
        .select("attempts, mastery_score, completed_at")
        .eq("user_id", userId)
        .eq("chapter_id", chapterId)
        .maybeSingle(),
      readStreak(userId),
    ]);
    if (claimError) throw new Error(claimError.message);
    if (!claimed) throw new Error("Quiz has already been submitted");

    const graded = submitted.map((a) => ({
      questionId: a.questionId,
      selectedIndex: a.selectedIndex,
      correct: a.selectedIndex === rowById.get(a.questionId)?.correct_index,
    }));

    const total = graded.length;
    if (total === 0) {
      throw new Error("No valid questions in submission");
    }
    const score = graded.filter((g) => g.correct).length;
    const pct = score / total;
    const masteryScore = Math.round(pct * 100);
    const passed = pct >= 0.8;
    const now = new Date().toISOString();

    // Everything below writes different tables, so it is written together.
    // Only the progress row waits, for the attempt to be saved: mastery is
    // the average of the last MASTERY_WINDOW quiz scores (this one included,
    // once saved), so one lucky 5/5 doesn't mark a chapter mastered forever
    // and a chapter the student is now getting wrong shows up as weak again.
    const saveAttemptAndProgress = supabaseAdmin
      .from("quiz_attempts")
      .insert({
        user_id: userId,
        chapter_id: chapterId,
        score,
        total_questions: total,
        answers: graded as never,
        attempted_at: now,
      })
      .then(async ({ error: attemptError }) => {
        const mastery = rollingMastery(
          priorAttempts ?? [],
          attemptError ? null : { score, total_questions: total, attempted_at: now },
          pct,
          MASTERY_WINDOW,
        );
        await supabaseAdmin.from("chapter_progress").upsert(
          {
            user_id: userId,
            chapter_id: chapterId,
            attempts: (existing?.attempts ?? 0) + 1,
            last_attempt_at: now,
            mastery_score: mastery,
            completed_at: existing?.completed_at ?? (passed ? now : null),
          },
          { onConflict: "user_id,chapter_id" },
        );
        return mastery;
      });

    // XP per chapter per PKT day (see quizXpSource). Everything else still
    // counts for mastery and the days in a row, just without XP.
    const xpSource = quizXpSource(todaysAttempts ?? [], passed);
    const [rollingMasteryScore] = await Promise.all([
      saveAttemptAndProgress,
      logAnswers(
        userId,
        "quiz",
        graded.map((g) => ({
          questionId: g.questionId,
          chapterId,
          correct: g.correct,
        })),
        now,
      ),
      xpSource ? insertXp(userId, xpSource) : null,
      writeStreak(userId, streak),
    ]);

    return {
      score,
      total,
      passed,
      masteryScore: rollingMasteryScore,
      attemptScore: masteryScore,
      awardedXp: xpSource ? XP_AMOUNTS[xpSource] : 0,
      review: graded.map((answer) => {
        const question = rowById.get(answer.questionId)!;
        return {
          questionId: answer.questionId,
          prompt: question.prompt as string,
          options: Array.isArray(question.options) ? (question.options as string[]) : [],
          selectedIndex: answer.selectedIndex,
          correct: answer.correct,
          correctIndex: question.correct_index as number,
          explanation: (question.explanation as string | null) ?? null,
        };
      }),
    };
  });

// ---------------------------------------------------------------------------
// recordReview — persists a flashcard review (FSRS computed server-side) and
// awards XP/streak. XP is capped to once per card per PKT day so the endpoint
// cannot be farmed by re-rating the same card.
// ---------------------------------------------------------------------------

const RecordReviewInput = z.object({
  flashcardId: z.string().uuid(),
  rating: z.enum(["again", "hard", "good", "easy"]),
});

export const recordReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RecordReviewInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    // The card must exist and be approved — no XP for phantom cards. The
    // reads are independent, so they run together to keep each rating quick;
    // the streak row is read here so it can be written with the review.
    const [{ data: card }, { data: prev }, streak] = await Promise.all([
      supabaseAdmin
        .from("flashcards")
        .select("id")
        .eq("id", data.flashcardId)
        .eq("status", "approved")
        .maybeSingle(),
      supabaseAdmin
        .from("flashcard_reviews")
        .select(
          "reps, lapses, state, stability, difficulty, scheduled_days, elapsed_days, learning_steps, last_review, due_at, next_review_at",
        )
        .eq("user_id", userId)
        .eq("flashcard_id", data.flashcardId)
        .maybeSingle(),
      readStreak(userId),
    ]);
    if (!card) throw new Error("Flashcard not found");

    const next: ReviewState = schedule(
      (prev as Partial<ReviewState> | null) ?? null,
      data.rating as Rating,
    );

    const saveReview = supabaseAdmin.from("flashcard_reviews").upsert(
      {
        user_id: userId,
        flashcard_id: data.flashcardId,
        reps: next.reps,
        lapses: next.lapses,
        state: next.state,
        stability: next.stability,
        difficulty: next.difficulty,
        scheduled_days: next.scheduled_days,
        elapsed_days: next.elapsed_days,
        learning_steps: next.learning_steps,
        last_review: next.last_review,
        due_at: next.due_at,
        next_review_at: next.next_review_at,
      },
      { onConflict: "user_id,flashcard_id" },
    );

    // Award XP only for the first review of this card today (PKT).
    const today = pakistanDate();
    const lastReviewDay = prev?.last_review ? pakistanDate(new Date(prev.last_review)) : null;
    const xpEligible = lastReviewDay === null || lastReviewDay < today;

    // The review, days in a row and XP touch different tables, so they are
    // written together rather than one after another.
    const [{ error: saveError }] = await Promise.all([
      saveReview,
      writeStreak(userId, streak),
      xpEligible ? insertXp(userId, "flashcard") : null,
    ]);
    if (saveError) throw new Error(saveError.message);

    return { awardedXp: xpEligible ? XP_AMOUNTS.flashcard : 0 };
  });

// ---------------------------------------------------------------------------
// answerMistake — records one answer from "Fix your mistakes" (/review).
// Graded here against the approved answer key; the client's claimed result
// is ignored. XP once per PKT day for doing a review at all, so it can't be
// farmed question by question.
// ---------------------------------------------------------------------------

const AnswerMistakeInput = z.object({
  questionId: z.string().uuid(),
  selectedIndex: z.number().int().min(0).max(9),
});

export const answerMistake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AnswerMistakeInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const [{ data: q, error: questionError }, { data: historyRows, error: historyError }] =
      await Promise.all([
        supabaseAdmin
          .from("questions")
          .select("id, chapter_id, correct_index, explanation")
          .eq("id", data.questionId)
          .eq("status", "approved")
          .maybeSingle(),
        supabaseAdmin
          .from("question_answers")
          .select("question_id, chapter_id, correct, answered_at")
          .eq("user_id", userId)
          .eq("question_id", data.questionId)
          .order("answered_at", { ascending: true }),
      ]);
    if (questionError) throw new Error(questionError.message);
    if (!q) throw new Error("Question not found");
    if (historyError) throw new Error(historyError.message);
    const dueAt = buildHistory(historyRows ?? []).get(data.questionId)?.mistakeDueAt;
    if (dueAt === null || dueAt === undefined || dueAt > Date.now()) {
      throw new Error("This mistake is not due for review");
    }

    const correct = data.selectedIndex === q.correct_index;

    // Was there already a review answer today? (read before logging this one)
    const { count } = await supabaseAdmin
      .from("question_answers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "review")
      .gte("answered_at", startOfTodayPkt());

    await logAnswers(userId, "review", [
      { questionId: q.id as string, chapterId: (q.chapter_id as string | null) ?? null, correct },
    ]);

    let awardedXp = 0;
    if ((count ?? 0) === 0) {
      await insertXp(userId, "review");
      awardedXp = XP_AMOUNTS.review;
    }
    await bumpStreak(userId);

    return {
      correct,
      correctIndex: q.correct_index as number,
      explanation: (q.explanation as string | null) ?? null,
      awardedXp,
    };
  });
