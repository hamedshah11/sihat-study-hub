import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, RotateCcw, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  checkQuizAnswer,
  getChapterQuiz,
  submitQuiz,
  type ChapterQuizQuestion,
} from "@/lib/study.functions";
import { awardBadgesIfNeeded } from "@/lib/award-badges";
import { invalidateProgress, PROGRESS_QUERY_KEY, useProgress } from "@/lib/progress-data";
import type { ProgressPayload } from "@/lib/progress.functions";
import { useStudySessionLock } from "@/hooks/use-study-session";
import { SessionHeader } from "@/components/study/FlashcardDeck";
import { ReportProblem } from "@/components/study/ReportProblem";
import {
  AnswerFeedback,
  AnswerOption,
  lowerFirst,
  type OptionState,
} from "@/components/study/AnswerOption";
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
type Feedback = {
  correct: boolean;
  correctIndex: number;
  explanation: string | null;
  selectedIndex: number;
};

export type QuizOutcome = { score: number; total: number };

export function ChapterQuiz({
  chapterId,
  subjectName,
  onComplete,
  onExit,
}: {
  chapterId: string;
  subjectName?: string | null;
  /** When the quiz is part of a review session, hand control back here. */
  onComplete?: (outcome: QuizOutcome) => void;
  onExit?: () => void;
}) {
  const navigate = useNavigate();
  const [seed, setSeed] = useState(0);
  const loadQuiz = useServerFn(getChapterQuiz);
  const { data, isLoading, error } = useQuery({
    queryKey: ["chapter-quiz", chapterId, seed],
    queryFn: () => loadQuiz({ data: { chapterId } }),
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const exit =
    onExit ?? (() => navigate({ to: "/chapters/$chapterId", params: { chapterId }, search: {} }));

  if (isLoading) return <Skeleton className="mt-4 h-[420px] rounded-[26px]" />;

  if (error) {
    return (
      <div className="mt-4 rounded-[24px] border bg-card p-6 text-center">
        <h2 className="font-display text-[22px]">The quiz didn't load.</h2>
        <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
        <button
          className="mt-4 h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          onClick={() => setSeed((value) => value + 1)}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || !data.quizId || data.available < QUIZ_SIZE || data.questions.length < QUIZ_SIZE) {
    return (
      <div className="mt-4 rounded-[24px] border bg-card p-6 text-center">
        <h2 className="font-display text-[22px]">No quiz for this chapter yet.</h2>
        <p className="mx-auto mt-1 max-w-[300px] text-sm text-muted-foreground">
          Your teachers are still reviewing its questions. It will appear once five are approved.
        </p>
        <button
          onClick={exit}
          className="mt-4 h-11 rounded-full border border-border-strong px-5 text-sm font-semibold"
        >
          {onExit ? "Continue" : "Back to the chapter"}
        </button>
      </div>
    );
  }

  return (
    <QuizRunner
      key={seed}
      chapterId={chapterId}
      quizId={data.quizId}
      questions={data.questions}
      subjectName={subjectName ?? null}
      onExit={exit}
      onComplete={onComplete}
    />
  );
}

function QuizRunner({
  chapterId,
  quizId,
  questions,
  subjectName,
  onExit,
  onComplete,
}: {
  chapterId: string;
  quizId: string;
  questions: ChapterQuizQuestion[];
  subjectName: string | null;
  onExit: () => void;
  onComplete?: (outcome: QuizOutcome) => void;
}) {
  useStudySessionLock(true);
  const submit = useServerFn(submitQuiz);
  const check = useServerFn(checkQuizAnswer);
  const queryClient = useQueryClient();
  const { data: progress, dataUpdatedAt } = useProgress();
  const [before] = useState(() => queryClient.getQueryData<ProgressPayload>(PROGRESS_QUERY_KEY));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<SubmittedAnswer[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // Becomes false if the server can't lock answers yet (migration pending):
  // then answers are shown after the last question instead.
  const [instant, setInstant] = useState(true);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submittedAt, setSubmittedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const question = questions[index];
  const total = questions.length;
  const isLast = index + 1 >= total;

  async function finish(finalAnswers: SubmittedAnswer[]) {
    setBusy(true);
    try {
      const response = (await submit({ data: { quizId, answers: finalAnswers } })) as QuizResult;
      setResult(response);
      setSubmittedAt(Date.now());
      void invalidateProgress(queryClient);
      void awardBadgesIfNeeded();
    } catch (error) {
      console.error("Failed to save quiz results", error);
      setSaveError("Your quiz didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // One tap answers: the answer is locked on the server, then the correct
  // option and a one-line reason show straight away.
  async function choose(i: number) {
    if (busy || feedback) return;
    setSaveError(null);
    setSelected(i);
    if (!instant) return;
    setBusy(true);
    try {
      const res = await check({ data: { quizId, questionId: question.id, selectedIndex: i } });
      if (res.available) {
        setSelected(res.selectedIndex);
        setFeedback({
          correct: res.correct,
          correctIndex: res.correctIndex,
          explanation: res.explanation,
          selectedIndex: res.selectedIndex,
        });
      } else {
        setInstant(false);
      }
    } catch (e) {
      console.error("Answer check failed", e);
      setSelected(null);
      setSaveError("That answer didn't send. Check your connection and tap it again.");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (busy || selected === null) return;
    const nextAnswers = [...answers, { questionId: question.id, selectedIndex: selected }];
    setAnswers(nextAnswers);
    if (isLast) {
      await finish(nextAnswers);
      return;
    }
    setIndex(index + 1);
    setSelected(null);
    setFeedback(null);
    window.scrollTo({ top: 0 });
  }

  if (result) {
    const freshAfter = dataUpdatedAt > submittedAt ? progress : undefined;
    return (
      <QuizResults
        result={result}
        chapterId={chapterId}
        before={before}
        after={freshAfter}
        onDone={() =>
          onComplete ? onComplete({ score: result.score, total: result.total }) : onExit()
        }
      />
    );
  }

  const answered = feedback !== null || (!instant && selected !== null);
  const segments = questions.map((_, i) =>
    i < index || (i === index && answered) ? ("done" as const) : ("todo" as const),
  );

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SessionHeader
        title={`${subjectName ?? "Chapter"} · Quiz`}
        position={index + 1}
        total={total}
        onExit={onExit}
        exitLabel="End quiz"
        segments={segments}
      />

      {question.isDueMistake && (
        <p className="mt-6 inline-flex w-fit items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[12.5px] font-semibold text-chip-foreground">
          <RotateCcw className="size-3.5" aria-hidden /> You missed this one before
        </p>
      )}
      <h2 className={cn("fl-question text-foreground", question.isDueMistake ? "mt-3" : "mt-7")}>
        {question.prompt}
      </h2>

      <div role="radiogroup" aria-label="Answer options" className="mt-5 space-y-3">
        {question.options.map((option, i) => {
          let state: OptionState = "idle";
          if (feedback) {
            if (i === feedback.correctIndex) state = "correct";
            else if (i === feedback.selectedIndex) state = "wrong";
          } else if (i === selected) state = "picked";
          return (
            <AnswerOption
              key={i}
              index={i}
              text={option}
              state={state}
              disabled={Boolean(feedback) || busy}
              onClick={() => void choose(i)}
            />
          );
        })}
      </div>

      {feedback && (
        <AnswerFeedback correct={feedback.correct} explanation={feedback.explanation}>
          <ReportProblem kind="question" itemId={question.id} className="-mb-2" />
        </AnswerFeedback>
      )}

      {saveError && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-destructive-bg px-4 py-3 text-[13.5px] text-destructive-ink"
        >
          {saveError}
        </p>
      )}

      <div className="mt-auto pt-6">
        {answered && (
          <button
            type="button"
            onClick={() => void next()}
            disabled={busy}
            className="h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "One moment…" : isLast ? "See results" : "Next question"}
          </button>
        )}
        {!instant && (
          <p className="mt-2 text-center text-[12.5px] text-muted-foreground">
            Answers and explanations appear after the last question.
          </p>
        )}
      </div>
    </div>
  );
}

function chapterPercent(p: ProgressPayload | undefined, chapterId: string) {
  for (const s of p?.subjects ?? []) {
    const c = s.chapters.find((ch) => ch.id === chapterId);
    if (c) return { percent: c.percent, title: c.title };
  }
  return null;
}

function QuizResults({
  result,
  chapterId,
  before,
  after,
  onDone,
}: {
  result: QuizResult;
  chapterId: string;
  before?: ProgressPayload;
  after?: ProgressPayload;
  onDone: () => void;
}) {
  const [practising, setPractising] = useState(false);
  const missed = result.review.filter((a) => !a.correct);
  const was = chapterPercent(before, chapterId);
  const now = chapterPercent(after, chapterId);

  if (practising && missed.length) {
    return <PractiseMissed questions={missed} onDone={() => setPractising(false)} />;
  }

  return (
    <div className="animate-scale-in flex min-h-[calc(100dvh-2rem)] flex-col pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <p className="text-center text-[14px] font-semibold">Quiz complete</p>
      <div className="mt-4 flex justify-center gap-2.5">
        {result.review.map((a, i) =>
          a.correct ? (
            <span
              key={a.questionId}
              className="grid size-10 place-items-center rounded-full bg-rate-good text-night"
              aria-label={`Question ${i + 1} right`}
            >
              <Check className="size-[18px]" strokeWidth={2.5} />
            </span>
          ) : (
            <span
              key={a.questionId}
              className="grid size-10 place-items-center rounded-full border-2 border-rate-again text-rate-again"
              aria-label={`Question ${i + 1} missed`}
            >
              <X className="size-[18px]" strokeWidth={2.5} />
            </span>
          ),
        )}
      </div>
      <h2 className="mt-4 text-center font-display text-[38px] leading-tight">
        {result.score} out of {result.total}
      </h2>
      <p className="mt-1.5 text-center text-[14.5px]">
        {now
          ? `${now.title}: ${was && was.percent !== now.percent ? `${was.percent}% to ${now.percent}%` : `${now.percent}%`}`
          : "Updating your progress…"}
      </p>

      {missed.length > 0 && (
        <div className="mt-7">
          <p className="text-[14px] font-semibold">
            {missed.length === 1 ? "The one you missed" : `The ${missed.length} you missed`}
          </p>
          <div className="mt-2.5 space-y-2.5">
            {missed.map((a) => (
              <div key={a.questionId} className="rounded-[16px] bg-muted p-4">
                <p className="text-[15px] font-semibold leading-snug">{a.prompt}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  {a.options[a.selectedIndex]
                    ? `You chose ${lowerFirst(a.options[a.selectedIndex])}. `
                    : ""}
                  The answer is {lowerFirst(a.options[a.correctIndex] ?? "")}
                  {a.explanation ? `. ${a.explanation}` : "."}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto space-y-3 pt-8">
        {missed.length > 0 && (
          <button
            type="button"
            onClick={() => setPractising(true)}
            className="h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            {missed.length === 1 ? "Practise the missed question" : "Practise the missed questions"}
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className={cn(
            "h-[52px] w-full rounded-full text-[15px] font-semibold",
            missed.length > 0
              ? "border border-border-strong"
              : "bg-primary text-primary-foreground",
          )}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** A quick, ungraded second try at the questions just missed. */
function PractiseMissed({ questions, onDone }: { questions: QuizReview[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const q = questions[index];
  const last = index + 1 >= questions.length;
  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SessionHeader
        title="Practice"
        position={index + 1}
        total={questions.length}
        onExit={onDone}
        exitLabel="Back to results"
        segments={questions.map((_, i) =>
          i < index || (i === index && picked !== null) ? "done" : "todo",
        )}
      />
      <p className="mt-7 text-[13px] font-semibold text-muted-foreground">
        Try it again. This one isn't scored.
      </p>
      <h2 className="fl-question mt-2">{q.prompt}</h2>
      <div className="mt-5 space-y-3">
        {q.options.map((option, i) => (
          <AnswerOption
            key={i}
            index={i}
            text={option}
            state={
              picked === null
                ? "idle"
                : i === q.correctIndex
                  ? "correct"
                  : i === picked
                    ? "wrong"
                    : "idle"
            }
            disabled={picked !== null}
            onClick={() => setPicked(i)}
          />
        ))}
      </div>
      {picked !== null && (
        <AnswerFeedback correct={picked === q.correctIndex} explanation={q.explanation} />
      )}
      <div className="mt-auto pt-6">
        {picked !== null && (
          <button
            type="button"
            onClick={() => {
              if (last) onDone();
              else {
                setIndex(index + 1);
                setPicked(null);
              }
            }}
            className="h-[52px] w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            {last ? "Back to results" : "Next question"}
          </button>
        )}
      </div>
    </div>
  );
}
