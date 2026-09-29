import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  MinusCircle,
  RotateCcw,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/celebrate";
import { EXAM_MODES, EXAM_PASS_MARK } from "@/lib/exam-config";
import type { ExamResult, ExamReviewQuestion } from "@/lib/exam.functions";

type Filter = "wrong" | "flagged" | "all";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function minutesLabel(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

export function ExamResults({
  result,
  celebrateOnMount,
  onDone,
}: {
  result: ExamResult;
  celebrateOnMount: boolean;
  onDone: () => void;
}) {
  const [view, setView] = useState<"summary" | "review" | "practice">("summary");
  const [filter, setFilter] = useState<Filter>("wrong");

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    if (celebrateOnMount && result.passed) celebrate(result.pct >= 95 ? "big" : "small");
  }, [celebrateOnMount, result.passed, result.pct]);

  const mistakes = useMemo(() => result.questions.filter((q) => !q.correct), [result.questions]);
  const titleByChapter = useMemo(
    () => new Map(result.breakdown.map((b) => [b.chapterId, b.title])),
    [result.breakdown],
  );
  // Weakest first, only chapters below the pass mark.
  const weakest = useMemo(
    () =>
      result.breakdown
        .filter((b) => b.total > 0 && b.correct / b.total < EXAM_PASS_MARK)
        .sort((a, b) => a.correct / a.total - b.correct / b.total)
        .slice(0, 3),
    [result.breakdown],
  );

  if (view === "practice") {
    return (
      <MistakePractice
        questions={mistakes}
        titleByChapter={titleByChapter}
        onExit={() => setView("summary")}
      />
    );
  }

  if (view === "review") {
    const list = result.questions.filter((q) =>
      filter === "all" ? true : filter === "flagged" ? q.flagged : !q.correct,
    );
    return (
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-primary">Review answers</h2>
          <button onClick={() => setView("summary")} className="text-sm font-semibold text-accent">
            Back to results
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl border bg-secondary/80 p-1 shadow-soft">
          {(
            [
              ["wrong", `Mistakes (${mistakes.length})`],
              ["flagged", `Flagged (${result.questions.filter((q) => q.flagged).length})`],
              ["all", `All (${result.questions.length})`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg py-1.5 text-xs font-semibold transition-colors",
                filter === f ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {list.length === 0 && (
          <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
            Nothing here.
          </p>
        )}
        {list.map((q) => (
          <ReviewCard
            key={q.id}
            q={q}
            number={result.questions.indexOf(q) + 1}
            chapterTitle={titleByChapter.get(q.chapterId)}
          />
        ))}
      </div>
    );
  }

  const modeLabel = EXAM_MODES[result.mode]?.label ?? "Exam";

  return (
    <div className="mt-4 space-y-5">
      {/* Score */}
      <section
        className={cn(
          "animate-scale-in rounded-2xl p-6 text-center shadow-lifted",
          result.passed ? "hero-gradient text-primary-foreground" : "border bg-card",
        )}
      >
        <div
          className={cn(
            "mx-auto inline-flex items-center justify-center rounded-full p-3.5",
            result.passed ? "bg-white/15" : "bg-accent/10 text-accent",
          )}
        >
          {result.passed ? <Trophy className="size-7" /> : <Target className="size-7" />}
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-widest opacity-80">
          {modeLabel}
        </p>
        <p className={cn("mt-1 text-5xl font-bold tabular-nums", !result.passed && "text-primary")}>
          {result.pct}%
        </p>
        <p className={cn("mt-1 text-sm", result.passed ? "opacity-90" : "text-muted-foreground")}>
          {result.score} of {result.total} correct ·{" "}
          {result.passed ? "Passed" : `${Math.round(EXAM_PASS_MARK * 100)}% needed to pass`}
        </p>
        <div
          className={cn(
            "mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs",
            result.passed ? "opacity-90" : "text-muted-foreground",
          )}
        >
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {minutesLabel(result.timeTakenSeconds)}
          </span>
          {result.answered < result.total && (
            <span className="inline-flex items-center gap-1">
              <MinusCircle className="size-3.5" /> {result.total - result.answered} unanswered
            </span>
          )}
          {result.xpAwarded > 0 && <span className="font-semibold">+{result.xpAwarded} XP</span>}
          {result.late && <span>Submitted after time</span>}
        </div>
      </section>

      {/* Actions */}
      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            setFilter(mistakes.length ? "wrong" : "all");
            setView("review");
          }}
          className="card-lift rounded-2xl border bg-card p-4 text-left shadow-soft"
        >
          <p className="text-sm font-semibold text-foreground">Review answers</p>
          <p className="text-xs text-muted-foreground">With explanations</p>
        </button>
        <button
          onClick={() => setView("practice")}
          disabled={mistakes.length === 0}
          className="card-lift rounded-2xl border bg-card p-4 text-left shadow-soft disabled:opacity-50"
        >
          <p className="text-sm font-semibold text-foreground">Practise mistakes</p>
          <p className="text-xs text-muted-foreground">
            {mistakes.length
              ? `${mistakes.length} question${mistakes.length === 1 ? "" : "s"}`
              : "None, well done"}
          </p>
        </button>
      </section>

      {/* Focus next */}
      {weakest.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Study these next</h2>
          {weakest.map((w) => (
            <div
              key={w.chapterId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-l-4 border-l-destructive/50 bg-card p-4 shadow-soft"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{w.title}</p>
                <p className="text-xs text-muted-foreground">
                  {w.correct}/{w.total} correct
                </p>
              </div>
              <Link
                to="/chapters/$chapterId"
                params={{ chapterId: w.chapterId }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Study <ArrowRight className="size-3" />
              </Link>
            </div>
          ))}
        </section>
      )}

      {/* Chapter breakdown */}
      <section className="rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="text-base font-semibold text-foreground">By chapter</h2>
        <ul className="mt-3 space-y-3">
          {result.breakdown.map((b) => {
            const pct = b.total ? Math.round((b.correct / b.total) * 100) : 0;
            const good = pct >= EXAM_PASS_MARK * 100;
            return (
              <li key={b.chapterId}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-foreground">{b.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {b.correct}/{b.total}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      good ? "bg-accent" : pct >= 50 ? "bg-streak" : "bg-destructive/70",
                    )}
                    style={{ width: `${Math.max(3, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <button
        onClick={onDone}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-soft"
      >
        <RotateCcw className="size-4" /> Back to exams
      </button>
    </div>
  );
}

function ReviewCard({
  q,
  number,
  chapterTitle,
}: {
  q: ExamReviewQuestion;
  number: number;
  chapterTitle?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          Q{number}
          {chapterTitle ? ` · ${chapterTitle}` : ""}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          {q.flagged && <Flag className="size-3.5 fill-streak text-streak" />}
          {q.correct ? (
            <span className="inline-flex items-center gap-1 font-semibold text-accent">
              <CheckCircle2 className="size-3.5" /> Correct
            </span>
          ) : q.selectedIndex === null ? (
            <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
              <MinusCircle className="size-3.5" /> Not answered
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold text-destructive">
              <XCircle className="size-3.5" /> Wrong
            </span>
          )}
        </span>
      </div>
      <p className="mt-2 font-medium text-primary">{q.prompt}</p>
      <div className="mt-3 space-y-2">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correctIndex;
          const isPicked = i === q.selectedIndex;
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 text-sm",
                isCorrect && "border-accent bg-accent/10",
                isPicked && !isCorrect && "border-destructive bg-destructive/10",
              )}
            >
              <span className="font-bold text-muted-foreground">{LETTERS[i] ?? i + 1}</span>
              <span className="flex-1">{opt}</span>
              {isCorrect && <span className="text-xs font-semibold text-accent">Answer</span>}
              {isPicked && !isCorrect && (
                <span className="text-xs font-semibold text-destructive">Your pick</span>
              )}
            </div>
          );
        })}
      </div>
      {q.explanation && (
        <p className="mt-3 rounded-xl bg-secondary/70 p-3 text-sm text-muted-foreground">
          {q.explanation}
        </p>
      )}
    </div>
  );
}

/**
 * Re-ask the questions the student got wrong, with instant feedback. Purely
 * for learning: nothing is recorded and no XP is given.
 */
function MistakePractice({
  questions,
  titleByChapter,
  onExit,
}: {
  questions: ExamReviewQuestion[];
  titleByChapter: Map<string, string>;
  onExit: () => void;
}) {
  const [queue, setQueue] = useState(questions);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [missedAgain, setMissedAgain] = useState<ExamReviewQuestion[]>([]);
  const [round, setRound] = useState(1);

  const q = queue[index];
  const revealed = picked !== null;

  function next() {
    const wasWrong = picked !== q.correctIndex;
    const missed = wasWrong ? [...missedAgain, q] : missedAgain;
    setPicked(null);
    if (index + 1 < queue.length) {
      setMissedAgain(missed);
      setIndex(index + 1);
    } else {
      // End of round: anything still wrong comes round again.
      setMissedAgain([]);
      setQueue(missed);
      setIndex(0);
      setRound((r) => r + 1);
    }
  }

  if (!q) {
    return (
      <div className="mt-4 rounded-2xl border bg-card p-6 text-center shadow-soft">
        <div className="mx-auto inline-flex items-center justify-center rounded-full bg-accent/10 p-4 text-accent">
          <CheckCircle2 className="size-7" />
        </div>
        <p className="mt-3 font-display text-lg font-bold text-primary">All mistakes fixed</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You answered every one correctly{round > 2 ? ` after ${round - 1} rounds` : ""}.
        </p>
        <button
          onClick={onExit}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Back to results
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Practise mistakes{round > 1 ? ` · round ${round}` : ""} · {index + 1} of {queue.length}
        </span>
        <button onClick={onExit} className="font-semibold text-accent">
          Stop
        </button>
      </div>
      <div
        key={`${round}-${q.id}`}
        className="animate-fade-up rounded-2xl border bg-card p-5 shadow-soft"
      >
        {titleByChapter.get(q.chapterId) && (
          <p className="text-xs text-muted-foreground">{titleByChapter.get(q.chapterId)}</p>
        )}
        <p className="mt-1 font-medium text-primary">{q.prompt}</p>
        <div className="mt-4 space-y-2">
          {q.options.map((opt, i) => {
            const isCorrect = i === q.correctIndex;
            const isPicked = i === picked;
            return (
              <button
                key={i}
                disabled={revealed}
                onClick={() => setPicked(i)}
                className={cn(
                  "flex min-h-[48px] w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                  !revealed && "hover:border-accent/40",
                  revealed && isCorrect && "border-accent bg-accent/10",
                  revealed && isPicked && !isCorrect && "border-destructive bg-destructive/10",
                )}
              >
                <span className="font-bold text-muted-foreground">{LETTERS[i] ?? i + 1}</span>
                <span className="flex-1">{opt}</span>
                {revealed && isCorrect && <CheckCircle2 className="size-4 text-accent" />}
                {revealed && isPicked && !isCorrect && (
                  <XCircle className="size-4 text-destructive" />
                )}
              </button>
            );
          })}
        </div>
        {revealed && (
          <div
            className={cn(
              "mt-4 rounded-xl p-3 text-sm",
              picked === q.correctIndex ? "bg-accent/10" : "bg-destructive/10",
            )}
          >
            <p className="font-medium">{picked === q.correctIndex ? "Correct!" : "Not quite."}</p>
            {q.explanation && <p className="mt-1 text-muted-foreground">{q.explanation}</p>}
          </div>
        )}
      </div>
      {revealed && (
        <button
          onClick={next}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          Next <ArrowRight className="size-4" />
        </button>
      )}
    </div>
  );
}
