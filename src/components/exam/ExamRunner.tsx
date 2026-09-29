import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Clock, Flag, LayoutGrid } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { submitExam, type ExamPayload, type ExamResult } from "@/lib/exam.functions";

type Saved = {
  answers: Record<string, number>;
  flagged: string[];
  index: number;
};

const storageKey = (attemptId: string) => `sihat-exam-${attemptId}`;

// Browser storage is a convenience: it keeps answers through a refresh or a
// dropped signal. Every access is guarded because it can be unavailable.
function loadSaved(attemptId: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(storageKey(attemptId));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function save(attemptId: string, s: Saved) {
  try {
    window.localStorage.setItem(storageKey(attemptId), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function clearSaved(attemptId: string) {
  try {
    window.localStorage.removeItem(storageKey(attemptId));
  } catch {
    /* ignore */
  }
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function ExamRunner({
  exam,
  subjectName,
  onSubmitted,
}: {
  exam: ExamPayload;
  subjectName: string;
  onSubmitted: (r: ExamResult) => void;
}) {
  const submitFn = useServerFn(submitExam);
  const initial = useMemo(() => loadSaved(exam.attemptId), [exam.attemptId]);
  const [answers, setAnswers] = useState<Record<string, number>>(initial?.answers ?? {});
  const [flagged, setFlagged] = useState<Set<string>>(new Set(initial?.flagged ?? []));
  const [index, setIndex] = useState(
    Math.min(initial?.index ?? 0, Math.max(0, exam.questions.length - 1)),
  );
  const [now, setNow] = useState(() => Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const total = exam.questions.length;
  const q = exam.questions[index];
  const answeredCount = Object.keys(answers).length;
  const unanswered = total - answeredCount;
  const secondsLeft = Math.ceil((new Date(exam.expiresAt).getTime() - now) / 1000);
  const timeUp = secondsLeft <= 0;

  // Persist on every change.
  useEffect(() => {
    save(exam.attemptId, { answers, flagged: [...flagged], index });
  }, [exam.attemptId, answers, flagged, index]);

  // Tick once a second.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Warn before closing the tab mid-exam (answers are saved, but the clock runs).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitFn({
        data: {
          attemptId: exam.attemptId,
          answers: exam.questions.map((x) => ({
            questionId: x.id,
            selectedIndex: answers[x.id] ?? null,
          })),
          flaggedIds: [...flagged],
        },
      });
      clearSaved(exam.attemptId);
      onSubmitted(result);
    } catch (e) {
      submittedRef.current = false;
      setSubmitError(
        e instanceof Error && e.message
          ? `${e.message} Your answers are saved on this phone. Try again when you have signal.`
          : "Couldn't submit. Your answers are saved on this phone. Try again when you have signal.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [answers, exam, flagged, onSubmitted, submitFn]);

  // Auto-submit when the clock runs out (once).
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (timeUp && !autoSubmitted.current) {
      autoSubmitted.current = true;
      setConfirmOpen(false);
      void doSubmit();
    }
  }, [timeUp, doSubmit]);

  function choose(optionIndex: number) {
    if (timeUp || submitting) return;
    setAnswers((prev) => {
      const next = { ...prev };
      // Tapping the chosen option again clears it.
      if (next[q.id] === optionIndex) delete next[q.id];
      else next[q.id] = optionIndex;
      return next;
    });
  }

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
  }

  function go(i: number) {
    setIndex(Math.max(0, Math.min(total - 1, i)));
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!q) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-soft">
        This exam has no questions.
      </div>
    );
  }

  const clockTone =
    secondsLeft <= 60
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : secondsLeft <= 300
        ? "border-streak/40 bg-streak/10 text-streak"
        : "border-border bg-card text-foreground";

  const isFlagged = flagged.has(q.id);
  const selected = answers[q.id];

  return (
    <div className="pb-4">
      {/* Sticky exam bar */}
      <div className="sticky top-0 z-30 -mx-4 border-b bg-background/90 px-4 pb-3 pt-2 backdrop-blur-xl md:-mx-8 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{subjectName}</p>
            <p className="text-sm font-semibold text-foreground">
              Question {index + 1}{" "}
              <span className="font-normal text-muted-foreground">of {total}</span>
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold tabular-nums shadow-soft",
              clockTone,
            )}
            role="timer"
            aria-label={`${formatClock(secondsLeft)} remaining`}
          >
            <Clock className="size-4" /> {formatClock(secondsLeft)}
          </div>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(answeredCount / total) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {answeredCount} answered · {unanswered} left
          {flagged.size > 0 ? ` · ${flagged.size} flagged` : ""}
        </p>
      </div>

      {/* Question */}
      <div key={q.id} className="animate-fade-up mt-4 rounded-2xl border bg-card p-5 shadow-soft">
        <p className="text-base font-medium leading-relaxed text-primary">{q.prompt}</p>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Options">
          {q.options.map((opt, i) => {
            const picked = selected === i;
            return (
              <button
                key={i}
                role="radio"
                aria-checked={picked}
                onClick={() => choose(i)}
                disabled={timeUp || submitting}
                className={cn(
                  "flex min-h-[48px] w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                  picked
                    ? "border-accent bg-accent/10 text-foreground"
                    : "hover:border-accent/40 hover:bg-secondary/60",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
                    picked ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {LETTERS[i] ?? i + 1}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={toggleFlag}
          className={cn(
            "mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            isFlagged
              ? "border-streak/40 bg-streak/10 text-streak"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Flag className={cn("size-3.5", isFlagged && "fill-current")} />
          {isFlagged ? "Flagged for review" : "Flag for review"}
        </button>
      </div>

      {submitError && (
        <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {submitError}
        </p>
      )}

      {/* Controls */}
      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <button
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="inline-flex size-12 items-center justify-center rounded-full border bg-card shadow-soft disabled:opacity-40"
          aria-label="Previous question"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          onClick={() => setNavOpen(true)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border bg-card text-sm font-semibold text-foreground shadow-soft"
        >
          <LayoutGrid className="size-4" /> All questions
        </button>
        {index < total - 1 ? (
          <button
            onClick={() => go(index + 1)}
            className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft"
            aria-label="Next question"
          >
            <ChevronRight className="size-5" />
          </button>
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-soft disabled:opacity-60"
          >
            Submit
          </button>
        )}
      </div>
      {index < total - 1 && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={submitting}
          className="mt-3 w-full rounded-full py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {submitting ? "Submitting…" : "Finish and submit"}
        </button>
      )}

      {/* Question navigator */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>All questions</SheetTitle>
            <SheetDescription>
              {answeredCount} of {total} answered. Tap a number to jump to it.
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-6 gap-2 px-4 pb-2 sm:grid-cols-10">
            {exam.questions.map((x, i) => {
              const done = answers[x.id] !== undefined;
              const flag = flagged.has(x.id);
              return (
                <button
                  key={x.id}
                  onClick={() => go(i)}
                  className={cn(
                    "relative grid aspect-square place-items-center rounded-lg border text-sm font-semibold tabular-nums",
                    done ? "border-accent bg-accent/15 text-foreground" : "text-muted-foreground",
                    i === index && "ring-2 ring-primary",
                  )}
                  aria-label={`Question ${i + 1}${done ? ", answered" : ""}${flag ? ", flagged" : ""}`}
                >
                  {i + 1}
                  {flag && (
                    <Flag className="absolute right-0.5 top-0.5 size-2.5 fill-streak text-streak" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 px-4 pb-6 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded border border-accent bg-accent/15" /> Answered
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded border" /> Not answered
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Flag className="size-3 fill-streak text-streak" /> Flagged
            </span>
          </div>
        </SheetContent>
      </Sheet>

      {/* Submit confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your exam?</AlertDialogTitle>
            <AlertDialogDescription>
              {unanswered > 0
                ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. They will be marked wrong.`
                : "You've answered every question."}
              {flagged.size > 0
                ? ` ${flagged.size} question${flagged.size === 1 ? " is" : "s are"} flagged for review.`
                : ""}{" "}
              You can't change answers after submitting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void doSubmit();
              }}
            >
              Submit exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Blocking overlay while grading / after time runs out */}
      {(submitting || (timeUp && !submitError)) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-2xl border bg-card px-6 py-5 text-center shadow-lifted">
            <p className="font-display text-lg font-bold text-primary">
              {timeUp ? "Time's up" : "Marking your paper"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Submitting your answers…</p>
          </div>
        </div>
      )}
    </div>
  );
}
