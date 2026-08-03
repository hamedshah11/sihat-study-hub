import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { schedule, type ReviewState, type Rating } from "@/lib/spacedRepetition";

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

// Server-controlled XP amounts. The client never gets to choose these.
const XP_AMOUNTS = {
  flashcard: 1,
  quiz: 10,
  quiz_pass: 15,
  tutor: 2,
} as const;

type XpSource = keyof typeof XP_AMOUNTS;

// Pakistan Standard Time is UTC+5 with no DST. Streaks roll over at PKT midnight.
function pakistanDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function insertXp(userId: string, source: XpSource): Promise<void> {
  await supabaseAdmin
    .from("xp_events")
    .insert({ user_id: userId, amount: XP_AMOUNTS[source], source });
}

// Idempotent per PKT day: a second activity on the same day does not advance
// the streak, so this is safe to call on every qualifying action.
async function bumpStreak(userId: string): Promise<void> {
  const today = pakistanDate();
  const { data: streak } = await supabaseAdmin
    .from("streaks")
    .select("current_streak, longest_streak, last_active_date, freezes_available")
    .eq("user_id", userId)
    .maybeSingle();

  if (!streak) {
    await supabaseAdmin.from("streaks").insert({
      user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      last_active_date: today,
      freezes_available: 1,
    });
    return;
  }

  if (streak.last_active_date === today) return;

  const yesterday = pakistanDate(new Date(Date.now() - 86400000));
  const continued = streak.last_active_date === yesterday;
  const newCurrent = continued ? (streak.current_streak ?? 0) + 1 : 1;
  const newLongest = Math.max(streak.longest_streak ?? 0, newCurrent);
  await supabaseAdmin
    .from("streaks")
    .update({
      current_streak: newCurrent,
      longest_streak: newLongest,
      last_active_date: today,
    })
    .eq("user_id", userId);
}

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

    await supabaseAdmin.from("quiz_attempts").insert({
      user_id: userId,
      chapter_id: data.chapterId,
      score,
      total_questions: total,
      answers: graded as never,
      attempted_at: now,
    });

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

    await insertXp(userId, passed ? "quiz_pass" : "quiz");
    await bumpStreak(userId);

    return { score, total, passed, masteryScore };
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
