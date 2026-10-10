import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { recordReview } from "@/lib/study.functions";
import { schedule, type Rating, type ReviewState } from "@/lib/spacedRepetition";
import { useStudySessionLock } from "@/hooks/use-study-session";
import { RatingHelp } from "./RatingHelp";
import { ReportProblem } from "./ReportProblem";
import { cn } from "@/lib/utils";

export type DeckCard = {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  /** Shown in the header when a session mixes subjects. */
  subjectName?: string | null;
  previous?: Partial<ReviewState> | null;
};

export type DeckResult = { reviewed: number; subjectIds?: string[] };

// The four FSRS ratings in plain words. The buttons stay neutral, so colour
// never carries the meaning.
const RATINGS: { rating: Rating; label: string; fsrs: string }[] = [
  { rating: "again", label: "Forgot", fsrs: "Again" },
  { rating: "hard", label: "Barely", fsrs: "Hard" },
  { rating: "good", label: "Got it", fsrs: "Good" },
  { rating: "easy", label: "Instant", fsrs: "Easy" },
];

function whenBack(previous: Partial<ReviewState> | null | undefined, rating: Rating) {
  const ms = new Date(schedule(previous ?? null, rating).due_at).getTime() - Date.now();
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30);
  return `${months} mo`;
}

export function SessionHeader({
  title,
  position,
  total,
  onExit,
  exitLabel = "End session",
  segments,
}: {
  title: string;
  position: number;
  total: number;
  onExit: () => void;
  exitLabel?: string;
  /** Per-step states for short sessions (quiz); omitted for long decks. */
  segments?: ("done" | "current" | "todo" | "wrong")[];
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onExit}
        aria-label={exitLabel}
        className="grid size-11 shrink-0 place-items-center rounded-full border border-border-strong/70 bg-card text-foreground"
      >
        <X className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[13.5px] font-semibold">{title}</p>
          <p className="fl-number shrink-0 text-[12px] text-muted-foreground">
            {Math.min(position, total)} of {total}
          </p>
        </div>
        {segments ? (
          <div className="mt-1.5 flex gap-1" aria-hidden>
            {segments.map((s, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  s === "todo" ? "bg-muted" : s === "wrong" ? "bg-destructive" : "bg-accent",
                )}
              />
            ))}
          </div>
        ) : (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${(Math.min(position, total) / Math.max(1, total)) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One flashcard at a time: the question on its own, one button to reveal
 * the answer, then four plain-word ratings, each showing when the card
 * comes back. FSRS scheduling and the review write happen on the server.
 */
export function FlashcardDeck({
  cards,
  title,
  onExit,
  onFinish,
}: {
  cards: DeckCard[];
  title: string;
  onExit: () => void;
  onFinish: (result: DeckResult) => void;
}) {
  useStudySessionLock(true);
  const review = useServerFn(recordReview);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const card = cards[index];

  const rate = useCallback(
    async (rating: Rating) => {
      if (busy || !card) return;
      setBusy(true);
      setSaveError(false);
      try {
        await review({ data: { flashcardId: card.id, rating } });
        if (index + 1 >= cards.length) {
          onFinish({ reviewed: cards.length });
        } else {
          setIndex(index + 1);
          setRevealed(false);
          setShowHint(false);
        }
      } catch (e) {
        console.error("Failed to save review", e);
        setSaveError(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, card, cards.length, index, onFinish, review],
  );

  // Space reveals; 1–4 rate. Handy on laptops, harmless on phones.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        void rate(RATINGS[Number(e.key) - 1].rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, rate]);

  if (!card) return null;

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SessionHeader
        title={card.subjectName ? `${card.subjectName} · Flashcards` : title}
        position={index + 1}
        total={cards.length}
        onExit={onExit}
      />

      <div className="mt-5 flex flex-1 flex-col rounded-[26px] border bg-card p-5 md:p-7">
        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="flex flex-1 flex-col text-left"
            aria-label="Show answer"
          >
            <span className="mt-auto text-[12.5px] font-semibold text-muted-foreground">
              Question
            </span>
            <span className="fl-question mt-2 whitespace-pre-wrap text-foreground">
              {card.front}
            </span>
            <span className="mt-auto" />
          </button>
        ) : (
          <div className="flex flex-1 flex-col">
            <p className="mt-auto whitespace-pre-wrap text-[15px] leading-snug text-muted-foreground">
              {card.front}
            </p>
            <hr className="my-4" />
            <p className="text-[12.5px] font-semibold text-accent-ink">Answer</p>
            <p className="mt-2 whitespace-pre-wrap text-[18px] font-medium leading-[1.5] text-foreground">
              {card.back}
            </p>
            <div className="mt-auto pt-4">
              <ReportProblem kind="flashcard" itemId={card.id} />
            </div>
          </div>
        )}
        {!revealed && card.hint && (
          <div className="mt-3">
            {showHint ? (
              <p className="text-[14px] text-muted-foreground">Hint: {card.hint}</p>
            ) : (
              <button
                type="button"
                onClick={() => setShowHint(true)}
                className="min-h-11 text-[13px] font-semibold text-accent-ink"
              >
                Show a hint
              </button>
            )}
          </div>
        )}
      </div>

      {saveError && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-destructive-bg px-4 py-3 text-[13.5px] text-destructive-ink"
        >
          That rating didn't save. Check your connection, then tap it again.
        </p>
      )}

      <div className="mt-4">
        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            Show answer
          </button>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[13px] text-muted-foreground">How well did you remember it?</p>
              <RatingHelp />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map(({ rating, label, fsrs }) => (
                <button
                  key={rating}
                  type="button"
                  disabled={busy}
                  onClick={() => void rate(rating)}
                  aria-label={`${label} (${fsrs}), back in ${whenBack(card.previous, rating)}`}
                  className="flex h-[60px] flex-col items-center justify-center rounded-2xl border border-border-strong/70 bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <span className="text-[14px] font-semibold">{label}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {whenBack(card.previous, rating)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
