import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, XCircle, ClipboardList, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordStudyActivity } from "@/lib/study-activity";
import { awardBadgesIfNeeded } from "@/lib/award-badges";

type Question = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
};

const QUIZ_SIZE = 5;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

  const questions = useMemo(() => {
    if (!allQuestions || allQuestions.length < QUIZ_SIZE) return null;
    void seed;
    return shuffle(allQuestions).slice(0, QUIZ_SIZE);
  }, [allQuestions, seed]);

  if (isLoading) return <Skeleton className="h-64 rounded-xl mt-4" />;

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
      questions={questions!}
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
  onRetake,
}: {
  chapterId: string;
  questions: Question[];
  onRetake: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const q = questions[index];
  const total = questions.length;
  const score = answers.filter((a) => a.correct).length;

  const handleReveal = () => {
    if (selected === null) return;
    const correct = selected === q.correct_index;
    setAnswers((prev) => [
      ...prev,
      { questionId: q.id, selectedIndex: selected, correct },
    ]);
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
    try {
      await persistResults({
        chapterId,
        score: answers.filter((a) => a.correct).length,
        total,
        answers,
      });
    } catch (e) {
      console.error("Failed to save quiz results", e);
    } finally {
      setSaving(false);
      setFinished(true);
    }
  };

  if (finished && !reviewMode) {
    const pct = Math.round((score / total) * 100);
    const passed = pct >= 80;
    return (
      <div className="mt-4 rounded-xl bg-surface p-6 text-center">
        <div className="mx-auto inline-flex items-center justify-center rounded-full bg-muted p-4 text-accent">
          <Trophy className="size-8" />
        </div>
        <p className="mt-3 text-3xl font-bold text-primary">{score}/{total}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {passed
            ? "Excellent work! You've mastered this chapter."
            : score >= total / 2
              ? "Good effort — review and try again to master it."
              : "Keep going — review the notes and give it another shot."}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {answers.some((a) => !a.correct) && (
            <Button variant="outline" onClick={() => setReviewMode(true)}>
              Review wrong answers
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
              onRetake();
            }}
          >
            Retake quiz
          </Button>
        </div>
      </div>
    );
  }

  if (finished && reviewMode) {
    const wrong = answers
      .map((a, i) => ({ a, q: questions[i] }))
      .filter((x) => !x.a.correct);
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
                      isCorrect && "border-accent bg-accent/10",
                      isPicked && !isCorrect && "border-destructive bg-destructive/10",
                    )}
                  >
                    {opt}
                    {isCorrect && <span className="ml-2 text-xs text-accent">Correct</span>}
                    {isPicked && !isCorrect && (
                      <span className="ml-2 text-xs text-destructive">Your answer</span>
                    )}
                  </div>
                );
              })}
            </div>
            {q.explanation && (
              <p className="mt-3 text-sm text-muted-foreground">{q.explanation}</p>
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
    <div className="mt-4 rounded-xl bg-surface p-5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {index + 1} of {total}</span>
        <span>Score {score}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${((index + (revealed ? 1 : 0)) / total) * 100}%` }}
        />
      </div>

      <p className="mt-4 text-base font-medium text-primary">{q.prompt}</p>

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
                "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors",
                !revealed && isPicked && "border-accent bg-accent/5",
                showCorrect && "border-accent bg-accent/10",
                showWrong && "border-destructive bg-destructive/10",
                revealed && "cursor-default",
              )}
            >
              <RadioGroupItem value={String(i)} disabled={revealed} />
              <span className="flex-1">{opt}</span>
              {showCorrect && <CheckCircle2 className="size-4 text-accent" />}
              {showWrong && <XCircle className="size-4 text-destructive" />}
            </label>
          );
        })}
      </RadioGroup>

      {revealed && (
        <div
          className={cn(
            "mt-4 rounded-md p-3 text-sm",
            answers[answers.length - 1]?.correct
              ? "bg-accent/10 text-foreground"
              : "bg-destructive/10 text-foreground",
          )}
        >
          <p className="font-medium">
            {answers[answers.length - 1]?.correct ? "Correct!" : "Not quite."}
          </p>
          {q.explanation && (
            <p className="mt-1 text-muted-foreground">{q.explanation}</p>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        {!revealed ? (
          <Button onClick={handleReveal} disabled={selected === null}>
            Submit
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={saving}>
            {index + 1 < total ? "Next" : saving ? "Saving…" : "Finish"}
          </Button>
        )}
      </div>
    </div>
  );
}

async function persistResults({
  chapterId,
  score,
  total,
  answers,
}: {
  chapterId: string;
  score: number;
  total: number;
  answers: AnswerRecord[];
}) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;

  const pct = score / total;
  const masteryScore = Math.round(pct * 100);
  const passed = pct >= 0.8;
  const now = new Date().toISOString();

  // 1. Save attempt
  await supabase.from("quiz_attempts").insert({
    user_id: userId,
    chapter_id: chapterId,
    score,
    total_questions: total,
    answers: answers as never,
    attempted_at: now,
  });

  // 2. Upsert chapter_progress
  const { data: existingProgress } = await supabase
    .from("chapter_progress")
    .select("attempts, mastery_score, completed_at")
    .eq("user_id", userId)
    .eq("chapter_id", chapterId)
    .maybeSingle();

  const newAttempts = (existingProgress?.attempts ?? 0) + 1;
  const newMastery = Math.max(existingProgress?.mastery_score ?? 0, masteryScore);
  const completedAt = existingProgress?.completed_at ?? (passed ? now : null);

  await supabase.from("chapter_progress").upsert(
    {
      user_id: userId,
      chapter_id: chapterId,
      attempts: newAttempts,
      last_attempt_at: now,
      mastery_score: newMastery,
      completed_at: completedAt,
    },
    { onConflict: "user_id,chapter_id" },
  );

  await recordStudyActivity(passed ? "quiz_pass" : "quiz");
  await awardBadgesIfNeeded();
}

