import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, ChevronLeft, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { answerMistake } from "@/lib/study.functions";
import { MISTAKES_QUERY_KEY, useMistakes } from "@/lib/mistakes-data";
import { MISTAKE_CLEAR_AFTER, MISTAKE_SECOND_GAP_DAYS } from "@/lib/mistakes";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({ meta: [{ title: "Fix your mistakes — Sihat" }] }),
  component: ReviewPage,
});

const SESSION_SIZE = 10;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

type ReviewQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  chapterTitle: string | null;
  /** Already answered right once since the mistake: one more right clears it. */
  clearsOnRight: boolean;
};

function ReviewPage() {
  const { data: mistakes, isLoading } = useMistakes();
  // Freeze the session's question list when the page opens, so answering
  // (which refreshes the mistake list) doesn't reshuffle it mid-session.
  const [sessionIds, setSessionIds] = useState<string[] | null>(null);
  const ids = useMemo(() => {
    if (sessionIds) return sessionIds;
    return (mistakes?.due ?? []).slice(0, SESSION_SIZE).map((m) => m.questionId);
  }, [mistakes, sessionIds]);

  const history = mistakes?.history;
  const { data: questions, isLoading: questionsLoading } = useQuery({
    queryKey: ["review-questions", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<ReviewQuestion[]> => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, prompt, options, correct_index, explanation, chapters(title)")
        .in("id", ids)
        .eq("status", "approved");
      if (error) throw error;
      const byId = new Map(
        (data ?? []).map((q) => [
          q.id,
          {
            id: q.id,
            prompt: q.prompt,
            options: Array.isArray(q.options) ? (q.options as string[]) : [],
            correct_index: q.correct_index,
            explanation: q.explanation,
            chapterTitle:
              (q as unknown as { chapters: { title: string } | null }).chapters?.title ?? null,
            clearsOnRight: (history?.get(q.id)?.rightSinceWrong ?? 0) >= MISTAKE_CLEAR_AFTER - 1,
          },
        ]),
      );
      return ids.map((id) => byId.get(id)).filter((q): q is ReviewQuestion => !!q);
    },
  });

  return (
    <div>
      <header className="animate-fade-up">
        <Link
          to="/home"
          className="inline-flex items-center gap-1 rounded-full border bg-card py-1.5 pl-2 pr-3.5 text-sm font-medium text-muted-foreground shadow-soft transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Home
        </Link>
        <h1 className="font-display mt-4 text-2xl font-bold text-primary">Fix your mistakes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Questions you got wrong come back after a day. Get each one right twice and it's cleared.
        </p>
      </header>

      {isLoading || (ids.length > 0 && questionsLoading) ? (
        <Skeleton className="mt-6 h-64 rounded-2xl" />
      ) : !questions || questions.length === 0 ? (
        <NothingDue pending={mistakes?.pending ?? 0} />
      ) : (
        <ReviewRunner questions={questions} onStart={() => setSessionIds(ids)} />
      )}
    </div>
  );
}

function NothingDue({ pending }: { pending: number }) {
  return (
    <div className="mt-6 rounded-2xl border bg-card p-6 text-center shadow-soft">
      <div className="mx-auto inline-flex items-center justify-center rounded-full bg-accent/10 p-4 text-accent">
        <Sparkles className="size-7" />
      </div>
      <p className="mt-3 font-display text-lg font-bold text-primary">No mistakes due</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {pending > 0
          ? `${pending} question${pending === 1 ? " is" : "s are"} coming back over the next few days.`
          : "When you get a quiz or exam question wrong, it will come back here the next day."}
      </p>
      <Link
        to="/subjects"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft"
      >
        Study a chapter <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function ReviewRunner({
  questions,
  onStart,
}: {
  questions: ReviewQuestion[];
  onStart: () => void;
}) {
  const answerFn = useServerFn(answerMistake);
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [xp, setXp] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const done = index >= questions.length;
  const q = questions[index];

  async function choose(i: number) {
    if (picked !== null) return;
    if (index === 0 && results.length === 0) onStart();
    setPicked(i);
    const correct = i === q.correct_index;
    setResults((r) => [...r, correct]);
    try {
      const res = await answerFn({ data: { questionId: q.id, selectedIndex: i } });
      if (res.awardedXp) setXp((x) => x + res.awardedXp);
    } catch {
      setSaveError(true);
    }
  }

  function next() {
    setPicked(null);
    setIndex((n) => n + 1);
    window.scrollTo({ top: 0 });
    if (index + 1 >= questions.length) {
      void qc.invalidateQueries({ queryKey: MISTAKES_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["home-today"] });
    }
  }

  if (done) {
    const right = results.filter(Boolean).length;
    const cleared = questions.filter((qq, i) => results[i] && qq.clearsOnRight).length;
    const later = right - cleared;
    const wrong = results.length - right;
    const lines = [
      cleared > 0 && `${cleared} cleared for good`,
      later > 0 && `${later} back once more in ${MISTAKE_SECOND_GAP_DAYS} days`,
      wrong > 0 && `${wrong} back tomorrow`,
    ].filter(Boolean) as string[];
    return (
      <div className="mt-6 space-y-4">
        <div className="animate-scale-in rounded-2xl border bg-card p-6 text-center shadow-soft">
          <div className="mx-auto inline-flex items-center justify-center rounded-full bg-accent/10 p-4 text-accent">
            <CheckCircle2 className="size-7" />
          </div>
          <p className="mt-3 text-3xl font-bold text-primary tabular-nums">
            {right}/{results.length}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">right this time</p>
          <ul className="mt-4 space-y-1 text-sm text-foreground">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {xp > 0 && <p className="mt-3 text-xs font-semibold text-accent">+{xp} XP</p>}
        </div>
        <Link
          to="/home"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          Done
        </Link>
      </div>
    );
  }

  const revealed = picked !== null;
  const isRight = picked === q.correct_index;

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {index + 1} of {questions.length}
        </span>
        <span className="inline-flex items-center gap-1">
          <RotateCcw className="size-3" /> Missed before
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${((index + (revealed ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      <div key={q.id} className="animate-fade-up rounded-2xl border bg-card p-5 shadow-soft">
        {q.chapterTitle && <p className="text-xs text-muted-foreground">{q.chapterTitle}</p>}
        <p className="mt-1 text-base font-medium text-primary">{q.prompt}</p>
        <div className="mt-4 space-y-2">
          {q.options.map((opt, i) => {
            const correct = i === q.correct_index;
            const mine = i === picked;
            return (
              <button
                key={i}
                disabled={revealed}
                onClick={() => void choose(i)}
                className={cn(
                  "flex min-h-[48px] w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                  !revealed && "hover:border-accent/40 hover:bg-secondary/60",
                  revealed && correct && "border-accent bg-accent/10",
                  revealed && mine && !correct && "border-destructive bg-destructive/10",
                )}
              >
                <span className="font-bold text-muted-foreground">{LETTERS[i] ?? i + 1}</span>
                <span className="flex-1">{opt}</span>
                {revealed && correct && <CheckCircle2 className="size-4 text-accent" />}
                {revealed && mine && !correct && <XCircle className="size-4 text-destructive" />}
              </button>
            );
          })}
        </div>
        {revealed && (
          <div
            className={cn(
              "mt-4 rounded-xl p-3 text-sm",
              isRight ? "bg-accent/10" : "bg-destructive/10",
            )}
          >
            <p className="font-medium">{isRight ? "Correct!" : "Not quite."}</p>
            {q.explanation && <p className="mt-1 text-muted-foreground">{q.explanation}</p>}
          </div>
        )}
      </div>

      {saveError && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive">
          Some answers couldn't be saved. Check your connection.
        </p>
      )}

      {revealed && (
        <button
          onClick={next}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          {index + 1 < questions.length ? "Next" : "Finish"} <ArrowRight className="size-4" />
        </button>
      )}
    </div>
  );
}
