import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { SESSION_SIZE } from "@/lib/spacedRepetition";
import { awardBadgesIfNeeded } from "@/lib/award-badges";
import { invalidateProgress, PROGRESS_QUERY_KEY, useProgress } from "@/lib/progress-data";
import type { ProgressPayload } from "@/lib/progress.functions";
import { useChapterCards } from "@/lib/chapter-data";
import { NotDownloadedError } from "@/lib/downloads";
import { FlashcardDeck, type DeckCard } from "@/components/study/FlashcardDeck";
import { SessionComplete } from "@/components/study/SessionComplete";
import { NeedsInternet } from "@/components/OfflineBanner";

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
  const [flippedThrough, setFlippedThrough] = useState(false);
  const [finishedAt, setFinishedAt] = useState(0);
  const [round, setRound] = useState(0);

  const { data, isLoading, error } = useChapterCards(chapterId, round);
  // Read from the download (no signal): every card, to flip through. Ratings
  // need the server, so the deck shows them disabled.
  const fromDownload = data?.source === "download";

  const queue = useMemo<DeckCard[]>(() => {
    if (!data) return [];
    if (data.source === "download") return shuffle(data.cards);
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

  if (flippedThrough) {
    return (
      <div className="mt-4 rounded-[24px] border bg-card p-6 text-center">
        <h2 className="font-display text-[24px]">That's every card in this chapter.</h2>
        <p className="mx-auto mt-2 max-w-[300px] text-sm text-muted-foreground">
          Ratings need internet, so the cards you flipped offline weren't saved. Review them again
          when you're back online and Florence will schedule them.
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

  if (error) {
    return error instanceof NotDownloadedError ? (
      <NeedsInternet title="These flashcards aren't downloaded." className="mt-4">
        <p className="mt-1 text-sm text-muted-foreground">
          Connect to the internet to review them, or download this chapter for next time.
        </p>
        <button
          onClick={exit}
          className="mt-4 h-11 rounded-full border border-border-strong px-5 text-sm font-semibold"
        >
          Back to the chapter
        </button>
      </NeedsInternet>
    ) : (
      <div className="mt-4 rounded-[24px] border bg-card p-6 text-center">
        <h2 className="font-display text-[22px]">The flashcards didn't load.</h2>
        <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
        <button
          onClick={() => setRound((r) => r + 1)}
          className="mt-4 h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

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
      offline={fromDownload}
      onExit={exit}
      onFinish={({ reviewed, skipped }) => {
        if (skipped) {
          setFlippedThrough(true);
          if (reviewed) void invalidateProgress(qc);
          return;
        }
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
