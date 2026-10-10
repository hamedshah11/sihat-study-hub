import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { SESSION_SIZE, type ReviewState } from "@/lib/spacedRepetition";
import { awardBadgesIfNeeded } from "@/lib/award-badges";
import { invalidateProgress, PROGRESS_QUERY_KEY, useProgress } from "@/lib/progress-data";
import type { ProgressPayload } from "@/lib/progress.functions";
import { FlashcardDeck, type DeckCard } from "@/components/study/FlashcardDeck";
import { SessionComplete } from "@/components/study/SessionComplete";

type ReviewRow = Partial<ReviewState> & { flashcard_id: string };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ChapterFlashcards({
  chapterId,
  subjectId,
  subjectName,
}: {
  chapterId: string;
  chapterTitle: string;
  subjectId: string | null;
  subjectName: string | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: progress, dataUpdatedAt } = useProgress();
  const [before, setBefore] = useState<ProgressPayload | undefined>(undefined);
  const [finished, setFinished] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState(0);
  const [round, setRound] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["chapter-flashcards", chapterId, round],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      const { data: cards, error } = await supabase
        .from("flashcards")
        .select("id, front, back, hint")
        .eq("chapter_id", chapterId)
        .eq("status", "approved");
      if (error) throw error;
      let reviews: ReviewRow[] = [];
      if (userId && cards?.length) {
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
      return { cards: cards ?? [], reviews };
    },
    refetchOnWindowFocus: false,
  });

  const queue = useMemo<DeckCard[]>(() => {
    if (!data) return [];
    const now = Date.now();
    const byCard = new Map(data.reviews.map((r) => [r.flashcard_id, r]));
    const due: DeckCard[] = [];
    const fresh: DeckCard[] = [];
    for (const c of data.cards) {
      const r = byCard.get(c.id);
      const card: DeckCard = { ...c, previous: r ?? null };
      if (!r) fresh.push(card);
      else if (!r.due_at || new Date(r.due_at).getTime() <= now) due.push(card);
    }
    // Due cards first, then new ones; shuffled so the order isn't memorised.
    return [...shuffle(due), ...shuffle(fresh)].slice(0, SESSION_SIZE);
  }, [data]);

  const exit = () => navigate({ to: "/chapters/$chapterId", params: { chapterId }, search: {} });

  if (finished !== null) {
    return (
      <SessionComplete
        before={before}
        after={dataUpdatedAt > finishedAt ? progress : undefined}
        subjectIds={subjectId ? [subjectId] : undefined}
        label={`Session complete · ${finished} card${finished === 1 ? "" : "s"}`}
        onDone={exit}
      />
    );
  }

  if (isLoading) return <Skeleton className="mt-4 h-[420px] rounded-[26px]" />;

  if (queue.length === 0) {
    return (
      <div className="mt-4 rounded-[24px] border bg-card p-6 text-center">
        <h2 className="font-display text-[24px]">
          {data?.cards.length ? "Nothing due in this chapter." : "No flashcards yet."}
        </h2>
        <p className="mx-auto mt-2 max-w-[300px] text-sm text-muted-foreground">
          {data?.cards.length
            ? "You've reviewed everything that's due. These cards will come back when it's time."
            : "Your teachers are still reviewing this chapter's flashcards."}
        </p>
        <button
          onClick={exit}
          className="mt-5 h-11 rounded-full border border-border-strong px-5 text-sm font-semibold"
        >
          Back to the chapter
        </button>
      </div>
    );
  }

  return (
    <FlashcardDeck
      key={round}
      cards={queue}
      title={`${subjectName ?? "Chapter"} · Flashcards`}
      onExit={exit}
      onFinish={({ reviewed }) => {
        setBefore(qc.getQueryData<ProgressPayload>(PROGRESS_QUERY_KEY));
        setFinished(reviewed);
        setFinishedAt(Date.now());
        void invalidateProgress(qc);
        void awardBadgesIfNeeded();
        setRound((r) => r + 1);
      }}
    />
  );
}
