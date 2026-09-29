import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { schedule, type ReviewState, type Rating } from "@/lib/spacedRepetition";
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

// ---------------------------------------------------------------------------
// submitQuiz — grades a quiz attempt server-side and records score, mastery,
// XP and streak. The client sends only its selections; it cannot set the score.
// ---------------------------------------------------------------------------

const SubmitQuizInput = z.object({
  chapterId: z.string().uuid(),
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

    // Deduplicate by questionId (keep first selection).
    const seen = new Set<string>();
    const submitted = data.answers.filter((a) => {
      if (seen.has(a.questionId)) return false;
      seen.add(a.questionId);
      return true;
    });
    const questionIds = submitted.map((a) => a.questionId);

    // Authoritative answer key — only approved questions that truly belong to
    // this chapter count. Anything else the client sent is ignored.
    const { data: rows, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("id, correct_index")
      .eq("chapter_id", data.chapterId)
      .eq("status", "approved")
      .in("id", questionIds);
    if (qErr) throw new Error(qErr.message);

    const keyById = new Map<string, number>(
      (rows ?? []).map((r) => [r.id as string, r.correct_index as number]),
    );

    const graded = submitted
      .filter((a) => keyById.has(a.questionId))
      .map((a) => ({
        questionId: a.questionId,
        selectedIndex: a.selectedIndex,
        correct: a.selectedIndex === keyById.get(a.questionId),
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
      .eq("chapter_id", data.chapterId)
      .gte("attempted_at", startOfTodayPkt());

    await supabaseAdmin.from("quiz_attempts").insert({
      user_id: userId,
      chapter_id: data.chapterId,
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
        chapterId: data.chapterId,
        correct: g.correct,
      })),
      now,
    );

    const { data: existing } = await supabaseAdmin
      .from("chapter_progress")
      .select("attempts, mastery_score, completed_at")
      .eq("user_id", userId)
      .eq("chapter_id", data.chapterId)
      .maybeSingle();

    await supabaseAdmin.from("chapter_progress").upsert(
      {
        user_id: userId,
        chapter_id: data.chapterId,
        attempts: (existing?.attempts ?? 0) + 1,
        last_attempt_at: now,
        mastery_score: Math.max(existing?.mastery_score ?? 0, masteryScore),
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

    return { score, total, passed, masteryScore, awardedXp: xpSource ? XP_AMOUNTS[xpSource] : 0 };
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

    const { data: q } = await supabaseAdmin
      .from("questions")
      .select("id, chapter_id, correct_index")
      .eq("id", data.questionId)
      .eq("status", "approved")
      .maybeSingle();
    if (!q) throw new Error("Question not found");

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

    return { correct, correctIndex: q.correct_index as number, awardedXp };
  });
