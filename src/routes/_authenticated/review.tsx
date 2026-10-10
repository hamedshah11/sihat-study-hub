import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { answerMistake } from "@/lib/study.functions";
import { MISTAKES_QUERY_KEY, useMistakes } from "@/lib/mistakes-data";
import { MISTAKE_CLEAR_AFTER, MISTAKE_SECOND_GAP_DAYS } from "@/lib/mistakes";
import { invalidateProgress } from "@/lib/progress-data";
import { pageTitle } from "@/lib/brand";
import { useStudySessionLock } from "@/hooks/use-study-session";
import { SessionHeader } from "@/components/study/FlashcardDeck";
import { ReportProblem } from "@/components/study/ReportProblem";
import { AnswerFeedback, AnswerOption } from "@/components/study/AnswerOption";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({ meta: [{ title: pageTitle("Questions to revisit") }] }),
  component: ReviewPage,
});

const SESSION_SIZE = 10;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

type ReviewQuestion = {
  id: string;
  prompt: string;
  options: string[];
  chapterTitle: string | null;
  subjectColour: string | null;
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
        .select("id, prompt, options, chapters(title, subjects(colour))")
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
            chapterTitle:
              (q as unknown as { chapters: { title: string } | null }).chapters?.title ?? null,
            subjectColour:
              (q as unknown as { chapters: { subjects: { colour: string | null } | null } | null })
                .chapters?.subjects?.colour ?? null,
            clearsOnRight: (history?.get(q.id)?.rightSinceWrong ?? 0) >= MISTAKE_CLEAR_AFTER - 1,
          },
        ]),
      );
      return ids.map((id) => byId.get(id)).filter((q): q is ReviewQuestion => !!q);
    },
  });

  const navigate = useNavigate();
  const exit = () => navigate({ to: "/home" });

  if (isLoading || (ids.length > 0 && questionsLoading)) {
    return <Skeleton className="mt-2 h-[420px] rounded-[26px]" />;
  }
  if (!questions || questions.length === 0) {
    return <NothingDue pending={mistakes?.pending ?? 0} />;
  }
  return <ReviewRunner questions={questions} onStart={() => setSessionIds(ids)} onExit={exit} />;
}

function NothingDue({ pending }: { pending: number }) {
  return (
    <div className="mt-6 rounded-[24px] border bg-card p-6 text-center">
      <h1 className="font-display text-[26px]">Nothing to revisit.</h1>
      <p className="mx-auto mt-2 max-w-[300px] text-sm text-muted-foreground">
        {pending > 0
          ? `${pending} question${pending === 1 ? " comes" : "s come"} back over the next few days.`
          : "When you miss a quiz or exam question, it comes back here the next day."}
      </p>
      <Link
        to="/home"
        className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Back to Today
      </Link>
    </div>
  );
}

function ReviewRunner({
  questions,
  onStart,
  onExit,
}: {
  questions: ReviewQuestion[];
  onStart: () => void;
  onExit: () => void;
}) {
  useStudySessionLock(true);
  const answerFn = useServerFn(answerMistake);
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    correctIndex: number;
    explanation: string | null;
  } | null>(null);
  const done = index >= questions.length;
  const q = questions[index];

  async function choose(i: number) {
    if (picked !== null || busy) return;
    if (index === 0 && results.length === 0) onStart();
    setBusy(true);
    setSaveError(false);
    try {
      const res = await answerFn({ data: { questionId: q.id, selectedIndex: i } });
      setPicked(i);
      setFeedback({
        correct: res.correct,
        correctIndex: res.correctIndex,
        explanation: res.explanation,
      });
      setResults((r) => [...r, res.correct]);
    } catch {
      setSaveError(true);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setPicked(null);
    setFeedback(null);
    setIndex((n) => n + 1);
    window.scrollTo({ top: 0 });
    if (index + 1 >= questions.length) {
      void qc.invalidateQueries({ queryKey: MISTAKES_QUERY_KEY });
      void invalidateProgress(qc);
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
      <div className="animate-scale-in flex min-h-[calc(100dvh-2rem)] flex-col pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 text-center">
        <p className="text-[13px] font-semibold text-muted-foreground">Questions to revisit</p>
        <h1 className="mt-3 font-display text-[34px]">
          {right} out of {results.length}
        </h1>
        <ul className="mx-auto mt-4 space-y-1.5 text-[15px]">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="mt-auto pt-10">
          <Link
            to="/home"
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            Done
          </Link>
        </div>
      </div>
    );
  }

  const revealed = picked !== null;
  const isRight = feedback?.correct ?? false;

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SessionHeader
        title={q.chapterTitle ? `Revisit · ${q.chapterTitle}` : "Questions to revisit"}
        position={index + 1}
        total={questions.length}
        onExit={onExit}
      />
      <div key={q.id} className="animate-fade-up">
        <p className="mt-6 text-[12.5px] font-semibold text-muted-foreground">
          You missed this one before
        </p>
        <h2 className="fl-question mt-2">{q.prompt}</h2>
        <div className="mt-5 space-y-3">
          {q.options.map((opt, i) => (
            <AnswerOption
              key={i}
              index={i}
              text={opt}
              state={
                !revealed
                  ? "idle"
                  : i === feedback?.correctIndex
                    ? "correct"
                    : i === picked
                      ? "wrong"
                      : "idle"
              }
              disabled={revealed || busy}
              onClick={() => void choose(i)}
            />
          ))}
        </div>
        {revealed && (
          <AnswerFeedback correct={isRight} explanation={feedback?.explanation ?? null}>
            <ReportProblem kind="question" itemId={q.id} className="-mb-2" />
          </AnswerFeedback>
        )}
      </div>

      {saveError && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-destructive-bg px-4 py-3 text-[13.5px] text-destructive-ink"
        >
          This answer couldn't be checked. Check your connection and try again.
        </p>
      )}

      <div className="mt-auto pt-6">
        {revealed && (
          <button
            onClick={next}
            className="h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            {index + 1 < questions.length ? "Next question" : "Finish"}
          </button>
        )}
      </div>
    </div>
  );
}
