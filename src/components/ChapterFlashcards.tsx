import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Brain, Layers, Sparkles, X } from "lucide-react";
import { SESSION_SIZE, schedule, type Rating, type ReviewState } from "@/lib/spacedRepetition";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { recordReview } from "@/lib/study.functions";
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
  learning_steps: number | null;
  last_review: string | null;
  due_at: string | null;
};

export function ChapterFlashcards({
  chapterId,
  chapterTitle,
  subjectName,
}: {
  chapterId: string;
  chapterTitle: string;
  subjectName: string | null;
}) {
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
            "flashcard_id, reps, lapses, state, stability, difficulty, scheduled_days, elapsed_days, learning_steps, last_review, due_at",
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
    const now = Date.now();
    const reviewByCard = new Map(data.reviews.map((r) => [r.flashcard_id, r]));

    const due: Flashcard[] = [];
    const fresh: Flashcard[] = [];
    for (const c of data.cards) {
      const r = reviewByCard.get(c.id);
      if (!r) fresh.push(c);
      else if (!r.due_at || new Date(r.due_at).getTime() <= now) due.push(c);
    }
    // Shuffle each bucket so users don't see the same 10 cards in the same
    // order every session. Due cards still come before fresh ones.
    const shuffle = <T,>(arr: T[]): T[] => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const ordered = [...shuffle(due), ...shuffle(fresh)].slice(0, SESSION_SIZE);
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
      userId={data!.userId ?? null}
      reviewByCard={session.reviewByCard}
      chapterId={chapterId}
      chapterTitle={chapterTitle}
      subjectName={subjectName}
    />
  );
}

function FlashcardRunner({
  queue,
  userId,
  reviewByCard,
  chapterId,
  chapterTitle,
  subjectName,
}: {
  queue: Flashcard[];
  userId: string | null;
  reviewByCard: Map<string, ReviewRow>;
  chapterId: string;
  chapterTitle: string;
  subjectName: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [xp, setXp] = useState(0);
  const review = useServerFn(recordReview);

  if (done) {
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
              setXp(0);
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
  const previous = reviewByCard.get(card.id) as Partial<ReviewState> | undefined;
  const interval = (rating: Rating) => {
    const due = new Date(schedule(previous ?? null, rating).due_at).getTime() - Date.now();
    const minutes = Math.max(1, Math.round(due / 60_000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  };

  const rate = async (rating: Rating) => {
    if (busy || !userId) return;
    setBusy(true);
    try {
      // FSRS scheduling, the review write and XP all happen server-side now —
      // the browser can no longer write flashcard_reviews or xp_events.
      const res = await review({ data: { flashcardId: card.id, rating } });
      setXp((v) => v + (res?.awardedXp ?? 0));

      const newReviewed = reviewed + 1;
      setReviewed(newReviewed);
      if (index + 1 >= queue.length) {
        setDone(true);
        // Only check badges at end-of-session, not per card.
        void awardBadgesIfNeeded();
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

  const ratings: Array<{ rating: Rating; label: string; className: string }> = [
    { rating: "again", label: "Again", className: "bg-destructive-bg text-destructive-ink" },
    { rating: "hard", label: "Hard", className: "bg-warning-bg text-warning-ink" },
    { rating: "good", label: "Good", className: "bg-[var(--subject)] text-white" },
    { rating: "easy", label: "Easy", className: "bg-success-bg text-success-ink" },
  ];

  return (
    <div className="min-h-dvh bg-[linear-gradient(var(--subject-tint)_0_260px,transparent_260px)] px-1 pb-6 pt-6 md:px-4">
      <div className="flex items-center gap-3">
        <Link
          to="/chapters/$chapterId"
          params={{ chapterId }}
          search={{}}
          aria-label="End session"
          className="grid size-11 shrink-0 place-items-center rounded-[14px] border bg-card text-foreground"
        >
          <X className="size-5" />
        </Link>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--subject-tint-2)]">
          <div
            className="h-full rounded-full bg-[var(--subject)] transition-all"
            style={{ width: `${((index + 1) / queue.length) * 100}%` }}
          />
        </div>
        <span className="text-[13px] font-bold text-[var(--subject-ink)]">
          {index + 1} / {queue.length}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.04em] text-[var(--subject-ink)]">
        <span className="grid size-7 place-items-center rounded-lg bg-[var(--subject)] text-white">
          <Layers className="size-4" />
        </span>
        <span className="truncate">
          {chapterTitle} · {subjectName ?? "Chapter"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setShowBack((value) => !value)}
        className="relative mt-5 block h-[470px] w-full text-left [perspective:1200px]"
        aria-label={showBack ? "Show question" : "Show answer"}
      >
        <span
          aria-hidden
          className="absolute inset-x-6 bottom-[-24px] top-6 rounded-[28px] bg-[var(--subject-tint-2)]"
        />
        <span
          aria-hidden
          className="absolute inset-x-3 bottom-[-12px] top-3 rounded-[28px] bg-[var(--subject-tint)]"
        />
        <span className="flashcard-flip absolute inset-0" data-flipped={showBack}>
          <span className="flashcard-face absolute inset-0 flex flex-col rounded-[28px] bg-card p-6 shadow-lifted">
            <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground">
              QUESTION
            </span>
            <span className="mt-5 whitespace-pre-wrap font-display text-[32px] leading-[1.12] text-foreground">
              {card.front}
            </span>
            {card.hint && (
              <span className="mt-auto text-sm italic text-muted-foreground">
                Hint: {card.hint}
              </span>
            )}
            <span className="mt-auto text-center text-xs text-muted-foreground">Tap to reveal</span>
          </span>
          <span className="flashcard-face flashcard-back absolute inset-0 flex flex-col rounded-[28px] bg-card p-6 shadow-lifted">
            <span className="text-[11px] font-bold tracking-[0.08em] text-[var(--subject-ink)]">
              ANSWER
            </span>
            <span className="mt-5 whitespace-pre-wrap text-base font-semibold leading-relaxed text-foreground">
              {card.back}
            </span>
            <span className="mt-auto text-center text-xs text-muted-foreground">
              Tap to see the question
            </span>
          </span>
        </span>
      </button>

      {showBack && (
        <div className="mt-10">
          <p className="mb-2 text-center text-xs text-muted-foreground">
            How well did you know it?
          </p>
          <div className="grid grid-cols-4 gap-2">
            {ratings.map(({ rating, label, className }) => (
              <button
                key={rating}
                disabled={busy}
                onClick={() => rate(rating)}
                className={`flex h-[62px] flex-col items-center justify-center rounded-2xl disabled:opacity-50 ${className}`}
              >
                <span className="text-sm font-bold">{label}</span>
                <span className="text-[11px] opacity-85">{interval(rating)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
