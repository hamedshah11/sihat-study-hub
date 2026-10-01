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
  startOfTodayPkt,
  logAnswers,
} from "@/lib/activity.server";

// Why these run server-side with the service-role client:
// XP, streaks, quiz scores and chapter mastery feed the leaderboard, the
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

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("quiz_sessions")
      .select("id, chapter_id, question_ids, created_at, submitted_at")
      .eq("id", data.quizId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session || session.submitted_at) throw new Error("Quiz is no longer available");
    if (Date.now() - Date.parse(session.created_at) > 24 * 60 * 60 * 1000) {
      throw new Error("Quiz has expired. Start another quiz.");
    }
    const chapterId = session.chapter_id;
    const issuedIds = session.question_ids;

    // Deduplicate by questionId (keep first selection).
    const seen = new Set<string>();
    const submitted = data.answers.filter((a) => {
      if (seen.has(a.questionId)) return false;
      seen.add(a.questionId);
      return true;
    });
    const questionIds = submitted.map((a) => a.questionId);
    if (
      submitted.length !== issuedIds.length ||
      questionIds.some((questionId) => !issuedIds.includes(questionId))
    ) {
      throw new Error("Submit every question from the issued quiz");
    }

    // Authoritative answer key. Status is not filtered: a question retired
    // after the paper was issued is still graded as it was shown.
    const { data: rows, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("id, prompt, options, correct_index, explanation")
      .eq("chapter_id", chapterId)
      .in("id", questionIds);
    if (qErr) throw new Error(qErr.message);

    const rowById = new Map((rows ?? []).map((row) => [row.id as string, row]));
    if (rowById.size !== issuedIds.length) throw new Error("Issued quiz is incomplete");
    for (const answer of submitted) {
      const options = rowById.get(answer.questionId)?.options;
      if (!Array.isArray(options) || answer.selectedIndex >= options.length) {
        throw new Error("Invalid answer selection");
      }
    }

    // Claim the one-time paper before revealing any answer key. The
    // conditional update prevents two racing submissions from both grading.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("quiz_sessions")
      .update({ submitted_at: new Date().toISOString() })
      .eq("id", session.id)
      .is("submitted_at", null)
      .select("id")
      .maybeSingle();
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

    // Earlier attempts on this chapter today (PKT), read BEFORE inserting
    // this one. Used to cap XP so a quiz can't be retaken for endless XP.
    const { data: todaysAttempts } = await supabaseAdmin
      .from("quiz_attempts")
      .select("score, total_questions")
      .eq("user_id", userId)
      .eq("chapter_id", chapterId)
      .gte("attempted_at", startOfTodayPkt());

    await supabaseAdmin.from("quiz_attempts").insert({
      user_id: userId,
      chapter_id: chapterId,
      score,
      total_questions: total,
      answers: graded as never,
      attempted_at: now,
    });

    await logAnswers(
      userId,
      "quiz",
      graded.map((g) => ({
        questionId: g.questionId,
        chapterId,
        correct: g.correct,
      })),
      now,
    );

    const { data: existing } = await supabaseAdmin
      .from("chapter_progress")
      .select("attempts, mastery_score, completed_at")
      .eq("user_id", userId)
      .eq("chapter_id", chapterId)
      .maybeSingle();

    // Mastery = average of the last MASTERY_WINDOW quiz scores (this one
    // included), so one lucky 5/5 doesn't mark a chapter mastered forever
    // and a chapter the student is now getting wrong shows up as weak again.
    const { data: recent } = await supabaseAdmin
      .from("quiz_attempts")
      .select("score, total_questions")
      .eq("user_id", userId)
      .eq("chapter_id", chapterId)
      .order("attempted_at", { ascending: false })
      .limit(MASTERY_WINDOW);
    const recentPcts = (recent ?? [])
      .filter((a) => a.total_questions > 0)
      .map((a) => a.score / a.total_questions);
    if (recentPcts.length === 0) recentPcts.push(pct);
    const rollingMastery = Math.round(
      (recentPcts.reduce((a, b) => a + b, 0) / recentPcts.length) * 100,
    );

    await supabaseAdmin.from("chapter_progress").upsert(
      {
        user_id: userId,
        chapter_id: chapterId,
        attempts: (existing?.attempts ?? 0) + 1,
        last_attempt_at: now,
        mastery_score: rollingMastery,
        completed_at: existing?.completed_at ?? (passed ? now : null),
      },
      { onConflict: "user_id,chapter_id" },
    );

    // XP per chapter per PKT day: the first attempt earns quiz XP (or pass XP
    // if it passes); a later attempt earns pass XP only if it is the first
    // pass of the day. Everything else still counts for mastery and the
    // streak, just without XP.
    const priorToday = todaysAttempts ?? [];
    const passedEarlierToday = priorToday.some(
      (a) => a.total_questions > 0 && a.score / a.total_questions >= 0.8,
    );
    let xpSource: "quiz" | "quiz_pass" | null = null;
    if (priorToday.length === 0) xpSource = passed ? "quiz_pass" : "quiz";
    else if (passed && !passedEarlierToday) xpSource = "quiz_pass";
    if (xpSource) await insertXp(userId, xpSource);
    await bumpStreak(userId);

    return {
      score,
      total,
      passed,
      masteryScore: rollingMastery,
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

    // The card must exist and be approved — no XP for phantom cards.
    const { data: card } = await supabaseAdmin
      .from("flashcards")
      .select("id")
      .eq("id", data.flashcardId)
      .eq("status", "approved")
      .maybeSingle();
    if (!card) throw new Error("Flashcard not found");

    const { data: prev } = await supabaseAdmin
      .from("flashcard_reviews")
      .select(
        "reps, lapses, state, stability, difficulty, scheduled_days, elapsed_days, learning_steps, last_review, due_at, next_review_at",
      )
      .eq("user_id", userId)
      .eq("flashcard_id", data.flashcardId)
      .maybeSingle();

    const next: ReviewState = schedule(
      (prev as Partial<ReviewState> | null) ?? null,
      data.rating as Rating,
    );

    await supabaseAdmin.from("flashcard_reviews").upsert(
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

    await bumpStreak(userId);
    if (xpEligible) await insertXp(userId, "flashcard");

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
