import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { WifiOff, X } from "lucide-react";
import { recordReview } from "@/lib/study.functions";
import { schedule, type Rating, type ReviewState } from "@/lib/spacedRepetition";
import { useStudySessionLock } from "@/hooks/use-study-session";
import { useOnline } from "@/components/OfflineBanner";
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

export type DeckResult = {
  reviewed: number;
  /** Cards flipped past without a rating because there was no connection. */
  skipped?: number;
  subjectIds?: string[];
};

// The four FSRS ratings, each with its plain-word meaning underneath. The
// words carry the meaning; the colour (from the screen sheets) only helps.
const RATINGS: { rating: Rating; label: string; fsrs: string; tone: string }[] = [
  { rating: "again", label: "Forgot", fsrs: "Again", tone: "var(--rate-again)" },
  { rating: "hard", label: "Barely", fsrs: "Hard", tone: "var(--rate-hard)" },
  { rating: "good", label: "Got it", fsrs: "Good", tone: "var(--rate-good)" },
  { rating: "easy", label: "Instant", fsrs: "Easy", tone: "var(--rate-easy)" },
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
  /** Per-step states for a quiz (thick segments); decks get small dashes. */
  segments?: ("done" | "current" | "todo" | "wrong")[];
}) {
  const shown = Math.min(position, total);
  // Long decks: one dash per card, up to 18; beyond that the dashes stand
  // for equal shares of the deck.
  const dashes = Math.min(total, 18);
  const lit = total <= 18 ? shown : Math.round((shown / total) * dashes);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onExit}
        aria-label={exitLabel}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground"
      >
        <X className="size-[18px]" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-semibold">{title}</p>
          <p className="fl-number shrink-0 text-[12.5px] font-normal text-muted-foreground">
            {shown} of {total}
          </p>
        </div>
        {segments ? (
          <div className="mt-2 flex gap-1.5" aria-hidden>
            {segments.map((s, i) => (
              <span
                key={i}
                className={cn(
                  "h-[5px] flex-1 rounded-full",
                  s === "todo" ? "bg-muted" : "bg-accent",
                )}
              />
            ))}
          </div>
        ) : (
          <div className="mt-2 flex gap-[3px]" aria-hidden>
            {Array.from({ length: dashes }, (_, i) => (
              <span
                key={i}
                className={cn("h-[5px] flex-1 rounded-full", i < lit ? "bg-accent" : "bg-muted")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One flashcard at a time: the question on its own, one button to reveal
 * the answer, then Again / Hard / Good / Easy with their plain words
 * (Forgot, Barely, Got it, Instant). When each card comes back is in the
 * button's label and title, and "What do these mean?" explains them. FSRS scheduling and the review write happen on the server.
 *
 * With no connection the cards can still be flipped: the ratings are
 * disabled with a plain message (there is no offline save queue) and "Next
 * card" moves on without saving.
 */
export function FlashcardDeck({
  cards,
  title,
  offline: offlineSource = false,
  onExit,
  onFinish,
}: {
  cards: DeckCard[];
  title: string;
  /** The cards came from a download: ratings can't be saved. */
  offline?: boolean;
  onExit: () => void;
  onFinish: (result: DeckResult) => void;
}) {
  useStudySessionLock(true);
  const review = useServerFn(recordReview);
  const online = useOnline();
  const offline = offlineSource || !online;
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const card = cards[index];

  const advance = useCallback(
    (result: { saved: number; skipped: number }) => {
      if (index + 1 >= cards.length) {
        onFinish({ reviewed: result.saved, skipped: result.skipped || undefined });
      } else {
        setIndex(index + 1);
        setRevealed(false);
        setShowHint(false);
      }
    },
    [cards.length, index, onFinish],
  );

  const rate = useCallback(
    async (rating: Rating) => {
      if (busy || !card || offline) return;
      setBusy(true);
      setSaveError(false);
      try {
        await review({ data: { flashcardId: card.id, rating } });
        setSaved(saved + 1);
        advance({ saved: saved + 1, skipped });
      } catch (e) {
        console.error("Failed to save review", e);
        setSaveError(true);
      } finally {
        setBusy(false);
      }
    },
    [advance, busy, card, offline, review, saved, skipped],
  );

  const skip = useCallback(() => {
    setSaveError(false);
    setSkipped(skipped + 1);
    advance({ saved, skipped: skipped + 1 });
  }, [advance, saved, skipped]);

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

      <div className="mt-5 flex flex-1 flex-col rounded-[26px] border border-border-strong/40 bg-card p-6 md:p-8">
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
            <hr className="my-4 border-border" />
            <p className="text-[13px] font-semibold text-rate-good">Answer</p>
            <p className="mt-2.5 whitespace-pre-wrap text-[19px] leading-[1.55] text-foreground">
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

      {saveError && !offline && (
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
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="max-w-[150px] text-[13.5px] leading-snug text-muted-foreground">
                How well did you remember it?
              </p>
              <RatingHelp />
            </div>
            <div
              className="grid grid-cols-4 gap-2"
              aria-describedby={offline ? "ratings-offline" : undefined}
            >
              {RATINGS.map(({ rating, label, fsrs, tone }) => {
                const back = whenBack(card.previous, rating);
                return (
                  <button
                    key={rating}
                    type="button"
                    disabled={busy || offline}
                    onClick={() => void rate(rating)}
                    title={`Comes back in ${back}`}
                    aria-label={`${fsrs}: ${label}. Comes back in ${back}`}
                    style={{ borderColor: tone }}
                    className="flex h-[62px] flex-col items-center justify-center rounded-[16px] border-2 bg-card transition-transform disabled:opacity-50"
                  >
                    <span className="text-[15px] font-semibold" style={{ color: tone }}>
                      {fsrs}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">{label}</span>
                  </button>
                );
              })}
            </div>
            {offline && (
              <>
                <p
                  id="ratings-offline"
                  role="status"
                  className="mt-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-[13.5px]"
                >
                  <WifiOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  Saving reviews needs internet
                </p>
                <button
                  type="button"
                  onClick={skip}
                  className="mt-2 h-[50px] w-full rounded-full border border-border-strong text-[15px] font-semibold"
                >
                  {index + 1 >= cards.length ? "Finish" : "Next card"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
