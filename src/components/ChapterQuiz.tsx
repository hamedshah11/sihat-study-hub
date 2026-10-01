import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ClipboardList, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { getChapterQuiz, submitQuiz, type ChapterQuizQuestion } from "@/lib/study.functions";
import { awardBadgesIfNeeded } from "@/lib/award-badges";
import { celebrate } from "@/lib/celebrate";
import { MISTAKES_QUERY_KEY } from "@/lib/mistakes-data";
import { cn } from "@/lib/utils";

const QUIZ_SIZE = 5;

type SubmittedAnswer = { questionId: string; selectedIndex: number };
type QuizReview = SubmittedAnswer & {
  prompt: string;
  options: string[];
  correct: boolean;
  correctIndex: number;
  explanation: string | null;
};
type QuizResult = {
  score: number;
  total: number;
  passed: boolean;
  masteryScore: number;
  awardedXp: number;
  review: QuizReview[];
};

export function ChapterQuiz({ chapterId }: { chapterId: string }) {
  const [seed, setSeed] = useState(0);
  const loadQuiz = useServerFn(getChapterQuiz);
  const { data, isLoading, error } = useQuery({
    queryKey: ["chapter-quiz", chapterId, seed],
    queryFn: () => loadQuiz({ data: { chapterId } }),
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <Skeleton className="mt-4 h-64 rounded-xl" />;

  if (error) {
    return (
      <div className="mt-4 rounded-xl bg-surface p-8 text-center">
        <p className="text-sm text-destructive">The quiz could not be loaded.</p>
        <Button className="mt-4" variant="outline" onClick={() => setSeed((value) => value + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data || !data.quizId || data.available < QUIZ_SIZE || data.questions.length < QUIZ_SIZE) {
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
      quizId={data.quizId}
      questions={data.questions}
      onRetake={() => setSeed((value) => value + 1)}
    />
  );
}

function QuizRunner({
  chapterId,
  quizId,
  questions,
  onRetake,
}: {
  chapterId: string;
  quizId: string;
  questions: ChapterQuizQuestion[];
  onRetake: () => void;
}) {
  const submit = useServerFn(submitQuiz);
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<SubmittedAnswer[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const question = questions[index];
  const total = questions.length;

  async function continueQuiz() {
    if (selected === null || saving) return;
    const nextAnswers = [...answers, { questionId: question.id, selectedIndex: selected }];
    setSaveError(null);

    if (index + 1 < total) {
      setAnswers(nextAnswers);
      setIndex((value) => value + 1);
      setSelected(null);
      window.scrollTo({ top: 0 });
      return;
    }

    setSaving(true);
    try {
      const response = (await submit({
        data: { quizId, answers: nextAnswers },
      })) as QuizResult;
      setAnswers(nextAnswers);
      setResult(response);
      void queryClient.invalidateQueries({ queryKey: MISTAKES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["home-today"] });
      await awardBadgesIfNeeded();
      if (response.score >= 4) celebrate(response.score === response.total ? "big" : "small");
    } catch (error) {
      console.error("Failed to save quiz results", error);
      setSaveError("Your quiz wasn't submitted. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (result && !reviewMode) {
    const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
    const mistakes = result.review.filter((answer) => !answer.correct).length;
    return (
      <div className="animate-scale-in px-4 pb-8 pt-8 text-center">
        <div
          className="mx-auto grid size-40 place-items-center rounded-full bg-[conic-gradient(var(--subject)_var(--score),var(--subject-tint)_0)] p-2"
          style={{ "--score": `${pct * 3.6}deg` } as React.CSSProperties}
        >
          <div className="grid size-full place-items-center rounded-full bg-background">
            <span>
              <strong className="block font-display text-5xl font-normal text-foreground">
                {result.score}/{result.total}
              </strong>
              <span className="text-xs font-semibold text-muted-foreground">{pct}%</span>
            </span>
          </div>
        </div>
        <h2 className="mt-5 font-display text-[34px] text-foreground">
          {result.passed ? "Nicely done" : "Keep going"}
        </h2>
        <div className="mx-auto mt-2 max-w-[260px]">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>Chapter mastery</span>
            <span className="font-semibold tabular-nums text-foreground">
              {result.masteryScore}%
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--subject)]"
              style={{ width: `${Math.max(3, result.masteryScore)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Average of your last 3 quizzes</p>
        </div>
        <p className="animate-pop mx-auto mt-4 w-fit rounded-full bg-streak-bg px-3 py-1.5 text-xs font-bold text-streak-ink">
          {result.awardedXp > 0
            ? `+${result.awardedXp} XP`
            : "Retakes still build mastery. XP for this chapter's quiz resets tomorrow."}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card p-4">
            <strong className="block text-2xl text-success-ink">{result.score}</strong>
            <span className="text-xs text-muted-foreground">Correct</span>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <strong className="block text-2xl text-destructive-ink">{mistakes}</strong>
            <span className="text-xs text-muted-foreground">Missed</span>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {mistakes > 0 && (
            <Button
              onClick={() => setReviewMode(true)}
              className="h-13 rounded-2xl bg-[var(--subject)] text-white hover:bg-[var(--subject)]/90"
            >
              Review {mistakes} mistake{mistakes === 1 ? "" : "s"}
            </Button>
          )}
          <Button onClick={onRetake}>Try another quiz</Button>
          <Button variant="outline" asChild className="h-13 rounded-2xl">
            <Link to="/chapters/$chapterId" params={{ chapterId }} search={{}}>
              Back to chapter
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (result && reviewMode) {
    const wrong = result.review.filter((answer) => !answer.correct);
    return (
      <div className="mt-4 space-y-4">
        {wrong.map((answer) => (
          <div key={answer.questionId} className="rounded-xl bg-surface p-5">
            <p className="font-medium text-primary">{answer.prompt}</p>
            <div className="mt-3 space-y-2">
              {answer.options.map((option, optionIndex) => {
                const isCorrect = optionIndex === answer.correctIndex;
                const isPicked = optionIndex === answer.selectedIndex;
                return (
                  <div
                    key={optionIndex}
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      isCorrect && "border-success bg-success-bg",
                      isPicked && !isCorrect && "border-destructive bg-destructive-bg",
                    )}
                  >
                    {option}
                    {isCorrect && <span className="ml-2 text-xs text-success-ink">Correct</span>}
                    {isPicked && !isCorrect && (
                      <span className="ml-2 text-xs text-destructive">Your answer</span>
                    )}
                  </div>
                );
              })}
            </div>
            {answer.explanation && (
              <p className="mt-3 text-sm text-muted-foreground">{answer.explanation}</p>
            )}
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
                segment < index && "bg-[var(--subject)]",
                segment === index && "bg-[var(--subject)]",
                segment > index && "bg-[var(--subject-tint-2)]",
              )}
            />
          ))}
        </div>
        <span className="text-xs font-bold text-[var(--subject-ink)]">
          {index + 1} / {total}
        </span>
      </div>

      {question.isDueMistake && (
        <p className="mt-8 inline-flex items-center gap-1 rounded-full bg-streak-bg px-2.5 py-1 text-[11px] font-semibold text-streak-ink">
          <RotateCcw className="size-3" /> You missed this one before
        </p>
      )}
      <p className="mt-8 text-xs font-bold tracking-[0.12em] text-[var(--subject-ink)]">
        QUESTION {index + 1} OF {total}
      </p>
      <p className="mt-3 font-display text-[30px] leading-[1.15] text-foreground">
        {question.prompt}
      </p>

      <RadioGroup
        value={selected !== null ? String(selected) : ""}
        onValueChange={(value) => setSelected(Number(value))}
        className="mt-4 space-y-2"
      >
        {question.options.map((option, optionIndex) => {
          const isPicked = optionIndex === selected;
          return (
            <label
              key={optionIndex}
              className={cn(
                "flex min-h-[58px] cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 text-sm transition-colors",
                isPicked && "border-[var(--subject)] bg-[var(--subject-tint)]",
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold">
                {String.fromCharCode(65 + optionIndex)}
              </span>
              <RadioGroupItem value={String(optionIndex)} className="sr-only" />
              <span className="flex-1">{option}</span>
              {isPicked && <CheckCircle2 className="size-4 text-[var(--subject)]" />}
            </label>
          );
        })}
      </RadioGroup>

      {saveError && (
        <p className="mt-4 rounded-xl bg-destructive-bg px-4 py-3 text-sm text-destructive">
          {saveError}
        </p>
      )}

      <Button
        onClick={() => void continueQuiz()}
        disabled={selected === null || saving}
        className="mt-5 h-[52px] w-full rounded-2xl bg-[var(--subject)] text-white hover:bg-[var(--subject)]/90"
      >
        {saving ? "Submitting…" : index + 1 < total ? "Next question" : "Submit quiz"}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Answers and explanations are shown after you submit.
      </p>
    </div>
  );
}
