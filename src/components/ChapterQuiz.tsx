import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, XCircle, ClipboardList, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { submitQuiz } from "@/lib/study.functions";
import { awardBadgesIfNeeded } from "@/lib/award-badges";
import { celebrate } from "@/lib/celebrate";
import { buildHistory, pickQuizQuestions } from "@/lib/mistakes";
import { loadAnswerLog, MISTAKES_QUERY_KEY } from "@/lib/mistakes-data";
import { Link } from "@tanstack/react-router";

type Question = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
};

const QUIZ_SIZE = 5;

export function ChapterQuiz({ chapterId }: { chapterId: string }) {
  const [seed, setSeed] = useState(0);

  const { data: allQuestions, isLoading } = useQuery({
    queryKey: ["chapter-quiz-questions", chapterId],
    queryFn: async (): Promise<Question[]> => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, prompt, options, correct_index, explanation")
        .eq("chapter_id", chapterId)
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []).map((q) => ({
        ...q,
        options: Array.isArray(q.options) ? (q.options as string[]) : [],
      }));
    },
  });

  // This student's answers in this chapter. Reloaded on every retake (seed)
  // so the next quiz reflects what they just answered.
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["chapter-answer-log", chapterId, seed],
    queryFn: async () => buildHistory(await loadAnswerLog(chapterId)),
  });

  // Due mistakes first, then questions never seen, then those seen longest ago.
  const picked = useMemo(() => {
    if (!allQuestions || allQuestions.length < QUIZ_SIZE || !history) return null;
    const now = Date.now();
    const questions = pickQuizQuestions(allQuestions, history, QUIZ_SIZE, now);
    const reviewIds = new Set(
      questions
        .filter((q) => {
          const due = history.get(q.id)?.mistakeDueAt;
          return due !== null && due !== undefined && due <= now;
        })
        .map((q) => q.id),
    );
    return { questions, reviewIds };
  }, [allQuestions, history]);

  if (isLoading || historyLoading) return <Skeleton className="h-64 rounded-xl mt-4" />;

  if (!allQuestions || allQuestions.length < QUIZ_SIZE) {
    return (
      <div className="mt-4 rounded-xl bg-surface p-10 text-center">
        <div className="mx-auto inline-flex items-center justify-center rounded-full bg-muted p-4 text-muted-foreground">
          <ClipboardList className="size-8" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Not enough questions for this chapter yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <QuizRunner
      key={seed}
      chapterId={chapterId}
      questions={picked!.questions}
      reviewIds={picked!.reviewIds}
      onRetake={() => setSeed((s) => s + 1)}
    />
  );
}

type AnswerRecord = {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
};

function QuizRunner({
  chapterId,
  questions,
  reviewIds,
  onRetake,
}: {
  chapterId: string;
  questions: Question[];
  /** Questions answered wrong before that are due again. */
  reviewIds: Set<string>;
  onRetake: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  // null = not known (e.g. the save failed)
  const [awardedXp, setAwardedXp] = useState<number | null>(null);
  // Chapter mastery after this attempt (average of recent quizzes), from the server.
  const [mastery, setMastery] = useState<number | null>(null);
  const submit = useServerFn(submitQuiz);
  const queryClient = useQueryClient();

  const q = questions[index];
  const total = questions.length;
  const score = answers.filter((a) => a.correct).length;

  const handleReveal = () => {
    if (selected === null) return;
    const correct = selected === q.correct_index;
    setAnswers((prev) => [...prev, { questionId: q.id, selectedIndex: selected, correct }]);
    setRevealed(true);
  };

  const handleNext = async () => {
    if (index + 1 < total) {
      setIndex(index + 1);
      setSelected(null);
      setRevealed(false);
      return;
    }
    // Finish
    setSaving(true);
    const finalAnswers = answers; // already includes the just-revealed answer
    const finalScore = finalAnswers.filter((a) => a.correct).length;
    try {
      // The server recomputes the score from the raw selections; the client's
      // claimed score is never stored. XP/streak/mastery are written there too.
      const res = await submit({
        data: {
          chapterId,
          answers: finalAnswers.map((a) => ({
            questionId: a.questionId,
            selectedIndex: a.selectedIndex,
          })),
        },
      });
      setAwardedXp(res.awardedXp);
      setMastery(res.masteryScore);
      void queryClient.invalidateQueries({ queryKey: MISTAKES_QUERY_KEY });
      await awardBadgesIfNeeded();
    } catch (e) {
      console.error("Failed to save quiz results", e);
    } finally {
      setSaving(false);
      setFinished(true);
      if (finalScore >= 4) celebrate(finalScore === total ? "big" : "small");
    }
  };

  if (finished && !reviewMode) {
    const pct = Math.round((score / total) * 100);
    const passed = pct >= 80;
    return (
      <div className="animate-scale-in px-4 pb-8 pt-8 text-center">
        <div
          className="mx-auto grid size-40 place-items-center rounded-full bg-[conic-gradient(var(--subject)_var(--score),var(--subject-tint)_0)] p-2"
          style={{ "--score": `${pct * 3.6}deg` } as React.CSSProperties}
        >
          <div className="grid size-full place-items-center rounded-full bg-background">
            <span>
              <strong className="block font-display text-5xl font-normal text-foreground">
                {score}/{total}
              </strong>
              <span className="text-xs font-semibold text-muted-foreground">{pct}%</span>
            </span>
          </div>
        </div>
        <h2 className="mt-5 font-display text-[34px] text-foreground">
          {passed ? "Nicely done" : "Keep going"}
        </h2>
        {mastery !== null && (
          <div className="mx-auto mt-2 max-w-[260px]">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>Chapter mastery</span>
              <span className="font-semibold tabular-nums text-foreground">{mastery}%</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--subject)]"
                style={{ width: `${Math.max(3, mastery)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Average of your last 3 quizzes</p>
          </div>
        )}
        {awardedXp !== null && (
          <p className="animate-pop mx-auto mt-4 w-fit rounded-full bg-streak-bg px-3 py-1.5 text-xs font-bold text-streak-ink">
            {awardedXp > 0
              ? `+${awardedXp} XP`
              : "Retakes still build mastery. XP for this chapter's quiz resets tomorrow."}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card p-4">
            <strong className="block text-2xl text-success-ink">{score}</strong>
            <span className="text-xs text-muted-foreground">Correct</span>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <strong className="block text-2xl text-destructive-ink">{total - score}</strong>
            <span className="text-xs text-muted-foreground">Missed</span>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {answers.some((a) => !a.correct) && (
            <Button
              onClick={() => setReviewMode(true)}
              className="h-13 rounded-2xl bg-[var(--subject)] text-white hover:bg-[var(--subject)]/90"
            >
              Review {total - score} mistake{total - score === 1 ? "" : "s"}
            </Button>
          )}
          <Button
            onClick={() => {
              setIndex(0);
              setSelected(null);
              setRevealed(false);
              setAnswers([]);
              setFinished(false);
              setReviewMode(false);
              setAwardedXp(null);
              setMastery(null);
              onRetake();
            }}
          >
            Try another quiz
          </Button>
          <Button variant="outline" asChild className="h-13 rounded-2xl">
            <Link to="/chapters/$chapterId" params={{ chapterId }} search={{}}>
              Back to chapter
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (finished && reviewMode) {
    const wrong = answers.map((a, i) => ({ a, q: questions[i] })).filter((x) => !x.a.correct);
    return (
      <div className="mt-4 space-y-4">
        {wrong.map(({ a, q }) => (
          <div key={q.id} className="rounded-xl bg-surface p-5">
            <p className="font-medium text-primary">{q.prompt}</p>
            <div className="mt-3 space-y-2">
              {q.options.map((opt, i) => {
                const isCorrect = i === q.correct_index;
                const isPicked = i === a.selectedIndex;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      isCorrect && "border-success bg-success-bg",
                      isPicked && !isCorrect && "border-destructive bg-destructive-bg",
                    )}
                  >
                    {opt}
                    {isCorrect && <span className="ml-2 text-xs text-success-ink">Correct</span>}
                    {isPicked && !isCorrect && (
                      <span className="ml-2 text-xs text-destructive">Your answer</span>
                    )}
                  </div>
                );
              })}
            </div>
            {q.explanation && <p className="mt-3 text-sm text-muted-foreground">{q.explanation}</p>}
          </div>
        ))}
        <Button variant="outline" onClick={() => setReviewMode(false)} className="w-full">
          Back to results
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-4 pb-8 pt-6 md:px-4">
      <div className="flex items-center gap-3">
        <Link
          to="/chapters/$chapterId"
          params={{ chapterId }}
          search={{}}
          aria-label="End quiz"
          className="grid size-11 shrink-0 place-items-center rounded-[14px] border bg-card"
        >
          <X className="size-5" />
        </Link>
        <div className="flex flex-1 gap-1">
          {questions.map((_, segment) => (
            <span
              key={segment}
              className={cn(
                "h-2 flex-1 rounded-full",
                segment < answers.length &&
                  (answers[segment]?.correct ? "bg-success" : "bg-destructive"),
                segment === index && !revealed && "bg-[var(--subject)]",
                segment > index && "bg-[var(--subject-tint-2)]",
              )}
            />
          ))}
        </div>
        <span className="text-xs font-bold text-[var(--subject-ink)]">
          {index + 1} / {total}
        </span>
      </div>

      {reviewIds.has(q.id) && (
        <p className="mt-8 inline-flex items-center gap-1 rounded-full bg-streak-bg px-2.5 py-1 text-[11px] font-semibold text-streak-ink">
          <RotateCcw className="size-3" /> You missed this one before
        </p>
      )}
      <p className="mt-8 text-xs font-bold tracking-[0.12em] text-[var(--subject-ink)]">
        QUESTION {index + 1} OF {total}
      </p>
      <p className="mt-3 font-display text-[30px] leading-[1.15] text-foreground">{q.prompt}</p>

      <RadioGroup
        value={selected !== null ? String(selected) : ""}
        onValueChange={(v) => !revealed && setSelected(Number(v))}
        className="mt-4 space-y-2"
      >
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correct_index;
          const isPicked = i === selected;
          const showCorrect = revealed && isCorrect;
          const showWrong = revealed && isPicked && !isCorrect;
          return (
            <label
              key={i}
              className={cn(
                "flex min-h-[58px] cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 text-sm transition-colors",
                !revealed && isPicked && "border-[var(--subject)] bg-[var(--subject-tint)]",
                showCorrect && "animate-pop border-2 border-success bg-success-bg",
                showWrong && "border-2 border-destructive bg-destructive-bg",
                revealed && !showCorrect && !showWrong && "cursor-default opacity-70",
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold">
                {String.fromCharCode(65 + i)}
              </span>
              <RadioGroupItem value={String(i)} disabled={revealed} className="sr-only" />
              <span className="flex-1">{opt}</span>
              {showCorrect && <CheckCircle2 className="size-4 text-accent" />}
              {showWrong && <XCircle className="size-4 text-destructive" />}
            </label>
          );
        })}
      </RadioGroup>

      {revealed && (
        <div
          className={cn("mt-4 rounded-2xl bg-[var(--subject-tint)] p-4 text-sm text-foreground")}
        >
          <p className="font-medium">
            {answers[answers.length - 1]?.correct ? "Correct!" : "Not quite."}
          </p>
          {q.explanation && <p className="mt-1 text-muted-foreground">{q.explanation}</p>}
        </div>
      )}

      <div className="mt-5">
        {!revealed ? (
          <Button
            onClick={handleReveal}
            disabled={selected === null}
            className="h-[52px] w-full rounded-2xl bg-[var(--subject)] text-white hover:bg-[var(--subject)]/90"
          >
            Check answer
          </Button>
        ) : (
          <Button
            onClick={handleNext}
            disabled={saving}
            className="h-[52px] w-full rounded-2xl bg-[var(--subject)] text-white hover:bg-[var(--subject)]/90"
          >
            {index + 1 < total ? "Next question" : saving ? "Saving…" : "See results"}
          </Button>
        )}
      </div>
    </div>
  );
}
