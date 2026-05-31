import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles } from "lucide-react";
import { schedule, SESSION_SIZE, type Rating, type ReviewState } from "@/lib/spacedRepetition";
import { recordStudyActivity } from "@/lib/study-activity";
import { awardBadgesIfNeeded } from "@/lib/award-badges";

type Flashcard = {
  id: string;
  front: string;
  back: string;
  hint: string | null;
};

type ReviewRow = {
  flashcard_id: string;
  reps: number | null;
  lapses: number | null;
  state: string | null;
  stability: number | null;
  difficulty: number | null;
  scheduled_days: number | null;
  elapsed_days: number | null;
  last_review: string | null;
  next_review_at: string | null;
};

export function ChapterFlashcards({ chapterId }: { chapterId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["chapter-flashcards", chapterId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const { data: cards, error: cardsErr } = await supabase
        .from("flashcards")
        .select("id, front, back, hint")
        .eq("chapter_id", chapterId)
        .eq("status", "approved");
      if (cardsErr) throw cardsErr;

      let reviews: ReviewRow[] = [];
      if (userId && cards && cards.length) {
        const { data: r } = await supabase
          .from("flashcard_reviews")
          .select(
            "flashcard_id, reps, lapses, state, stability, difficulty, scheduled_days, elapsed_days, last_review, next_review_at",
          )
          .eq("user_id", userId)
          .in(
            "flashcard_id",
            cards.map((c) => c.id),
          );
        reviews = (r ?? []) as ReviewRow[];
      }

      return { cards: (cards ?? []) as Flashcard[], reviews, userId };
    },
  });

  const session = useMemo(() => {
    if (!data) return null;
    const today = new Date().toISOString().slice(0, 10);
    const reviewByCard = new Map(data.reviews.map((r) => [r.flashcard_id, r]));

    const due: Flashcard[] = [];
    const fresh: Flashcard[] = [];
    for (const c of data.cards) {
      const r = reviewByCard.get(c.id);
      if (!r) fresh.push(c);
      else if (!r.next_review_at || r.next_review_at <= today) due.push(c);
    }
    const ordered = [...due, ...fresh].slice(0, SESSION_SIZE);
    return { queue: ordered, reviewByCard };
  }, [data]);

  if (isLoading) return <Skeleton className="h-64 rounded-xl mt-4" />;

  if (!session || session.queue.length === 0) {
    return (
      <div className="mt-4 rounded-xl bg-surface p-10 text-center">
        <div className="mx-auto inline-flex items-center justify-center rounded-full bg-muted p-4 text-muted-foreground">
          <Brain className="size-8" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {data?.cards.length
            ? "All caught up — no cards due right now."
            : "No flashcards available for this chapter yet."}
        </p>
      </div>
    );
  }

  return (
    <FlashcardRunner
      queue={session.queue}
      reviewByCard={session.reviewByCard}
      userId={data!.userId ?? null}
    />
  );
}

function FlashcardRunner({
  queue,
  reviewByCard,
  userId,
}: {
  queue: Flashcard[];
  reviewByCard: Map<string, ReviewRow>;
  userId: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done) {
    const xp = reviewed; // 1 XP per card
    return (
      <div className="mt-4 rounded-xl bg-surface p-6 text-center">
        <div className="mx-auto inline-flex items-center justify-center rounded-full bg-muted p-4 text-accent">
          <Sparkles className="size-8" />
        </div>
        <p className="mt-3 text-2xl font-bold text-primary">Session complete</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {reviewed} card{reviewed === 1 ? "" : "s"} reviewed · +{xp} XP
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            onClick={() => {
              setIndex(0);
              setShowBack(false);
              setReviewed(0);
              setDone(false);
            }}
          >
            Continue studying
          </Button>
          <Button variant="outline" onClick={() => window.scrollTo({ top: 0 })}>
            Back to chapter
          </Button>
        </div>
      </div>
    );
  }

  const card = queue[index];

  const rate = async (rating: Rating) => {
    if (busy || !userId) return;
    setBusy(true);
    try {
      const prev = reviewByCard.get(card.id) as Partial<ReviewState> | undefined;
      const next = schedule(prev ?? null, rating);

      await supabase.from("flashcard_reviews").upsert(
        {
          user_id: userId,
          flashcard_id: card.id,
          reps: next.reps,
          lapses: next.lapses,
          state: next.state,
          stability: next.stability,
          difficulty: next.difficulty,
          scheduled_days: next.scheduled_days,
          elapsed_days: next.elapsed_days,
          last_review: next.last_review,
          next_review_at: next.next_review_at,
        },
        { onConflict: "user_id,flashcard_id" },
      );

      await supabase.from("xp_events").insert({
        user_id: userId,
        amount: 1,
        source: "flashcard",
      });

      await bumpStreak(userId);

      const newReviewed = reviewed + 1;
      setReviewed(newReviewed);
      if (index + 1 >= queue.length) {
        setDone(true);
      } else {
        setIndex(index + 1);
        setShowBack(false);
      }
    } catch (e) {
      console.error("Failed to save review", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Card {index + 1} of {queue.length}</span>
        <span>{reviewed} reviewed</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${(index / queue.length) * 100}%` }}
        />
      </div>

      <div className="mt-4 rounded-xl bg-surface p-6 min-h-[180px] flex items-center justify-center text-center">
        <div>
          <p className="text-base font-medium text-primary whitespace-pre-wrap">
            {card.front}
          </p>
          {!showBack && card.hint && (
            <p className="mt-3 text-xs text-muted-foreground italic">Hint: {card.hint}</p>
          )}
          {showBack && (
            <>
              <div className="my-4 h-px w-12 mx-auto bg-border" />
              <p className="text-sm text-foreground whitespace-pre-wrap">{card.back}</p>
            </>
          )}
        </div>
      </div>

      {!showBack ? (
        <Button className="mt-4 w-full" onClick={() => setShowBack(true)}>
          Show answer
        </Button>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="destructive" disabled={busy} onClick={() => rate("again")}>
            Again
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => rate("hard")}>
            Hard
          </Button>
          <Button disabled={busy} onClick={() => rate("good")}>
            Good
          </Button>
          <Button
            disabled={busy}
            onClick={() => rate("easy")}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Easy
          </Button>
        </div>
      )}
    </div>
  );
}

async function bumpStreak(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: streak } = await supabase
    .from("streaks")
    .select("current_streak, longest_streak, last_active_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (!streak) {
    await supabase.from("streaks").insert({
      user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      last_active_date: today,
      freezes_available: 1,
    });
    return;
  }
  if (streak.last_active_date === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const continued = streak.last_active_date === yesterday;
  const newCurrent = continued ? (streak.current_streak ?? 0) + 1 : 1;
  const newLongest = Math.max(streak.longest_streak ?? 0, newCurrent);
  await supabase
    .from("streaks")
    .update({
      current_streak: newCurrent,
      longest_streak: newLongest,
      last_active_date: today,
    })
    .eq("user_id", userId);
}
