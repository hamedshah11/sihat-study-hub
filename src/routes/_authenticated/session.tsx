import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { FlashcardDeck, type DeckCard } from "@/components/study/FlashcardDeck";
import { SessionComplete } from "@/components/study/SessionComplete";
import { ChapterQuiz } from "@/components/ChapterQuiz";
import { useProgress, invalidateProgress, PROGRESS_QUERY_KEY } from "@/lib/progress-data";
import { REVIEW_SESSION_SIZE } from "@/lib/progress-snapshot";
import type { ProgressPayload } from "@/lib/progress.functions";
import type { ReviewState } from "@/lib/spacedRepetition";
import { awardBadgesIfNeeded } from "@/lib/award-badges";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/session")({
  head: () => ({ meta: [{ title: pageTitle("Review") }] }),
  component: ReviewSession,
});

type Stage = "cards" | "quiz" | "done";
type ReviewRow = Partial<ReviewState> & { flashcard_id: string };

/**
 * Today's review, the nightly loop: due flashcards across the semester
 * (oldest first), then one quiz if a chapter is ready for one, then the
 * session-complete screen. On a day with nothing due, it introduces a few
 * fresh cards from the chapter in progress instead.
 */
function ReviewSession() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: snapshot, dataUpdatedAt, isLoading: loadingPlan } = useProgress();
  // The plan as it stood when the session opened; it doesn't shift mid-session.
  const [before, setBefore] = useState(() => qc.getQueryData<ProgressPayload>(PROGRESS_QUERY_KEY));
  useEffect(() => {
    if (!before && snapshot) setBefore(snapshot);
  }, [before, snapshot]);
  const plan = (before ?? snapshot)?.plan;
  const [stage, setStage] = useState<Stage | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [quizzes, setQuizzes] = useState(0);
  const [doneAt, setDoneAt] = useState(0);

  const subjects = (before ?? snapshot)?.subjects ?? [];
  const chapterSubject = new Map<string, { id: string; name: string }>();
  for (const s of subjects)
    for (const c of s.chapters) chapterSubject.set(c.id, { id: s.id, name: s.name });

  const { data: cards, isLoading: loadingCards } = useQuery({
    queryKey: ["review-session-cards", plan?.cardsDue, plan?.newCards?.chapterId],
    enabled: Boolean(plan),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DeckCard[]> => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId || !plan) return [];
      const semesterChapters = [...chapterSubject.keys()];
      if (plan.cardsDue > 0) {
        const { data: due } = await supabase
          .from("flashcard_reviews")
          .select(
            "flashcard_id, reps, lapses, state, stability, difficulty, scheduled_days, elapsed_days, learning_steps, last_review, due_at",
          )
          .eq("user_id", userId)
          .lte("due_at", new Date().toISOString())
          .order("due_at", { ascending: true })
          .limit(60);
        const rows = (due ?? []) as ReviewRow[];
        if (!rows.length) return [];
        const { data: found } = await supabase
          .from("flashcards")
          .select("id, front, back, hint, chapter_id")
          .in(
            "id",
            rows.map((r) => r.flashcard_id),
          )
          .eq("status", "approved")
          .in("chapter_id", semesterChapters);
        const byId = new Map((found ?? []).map((c) => [c.id, c]));
        return rows
          .filter((r) => byId.has(r.flashcard_id))
          .slice(0, REVIEW_SESSION_SIZE)
          .map((r) => {
            const c = byId.get(r.flashcard_id)!;
            return {
              id: c.id,
              front: c.front,
              back: c.back,
              hint: c.hint,
              subjectName: chapterSubject.get(c.chapter_id ?? "")?.name ?? null,
              previous: r,
            };
          });
      }
      if (plan.newCards) {
        const { data: chapterCards } = await supabase
          .from("flashcards")
          .select("id, front, back, hint, chapter_id")
          .eq("chapter_id", plan.newCards.chapterId)
          .eq("status", "approved")
          .order("created_at", { ascending: true });
        const { data: seen } = await supabase
          .from("flashcard_reviews")
          .select("flashcard_id")
          .eq("user_id", userId)
          .in(
            "flashcard_id",
            (chapterCards ?? []).map((c) => c.id),
          );
        const seenIds = new Set((seen ?? []).map((r) => r.flashcard_id));
        return (chapterCards ?? [])
          .filter((c) => !seenIds.has(c.id))
          .slice(0, plan.newCards.count)
          .map((c) => ({
            id: c.id,
            front: c.front,
            back: c.back,
            hint: c.hint,
            subjectName: chapterSubject.get(c.chapter_id ?? "")?.name ?? null,
            previous: null,
          }));
      }
      return [];
    },
  });

  const exit = () => navigate({ to: "/home" });

  if (loadingPlan || (plan && loadingCards)) {
    return <Skeleton className="mt-2 h-[480px] rounded-[26px]" />;
  }

  const current: Stage =
    stage ?? (cards && cards.length > 0 ? "cards" : plan?.quizChapterId ? "quiz" : "done");

  const studiedSubjectIds = [
    ...new Set(
      [
        ...(plan?.dueSubjects.map((s) => s.id) ?? []),
        plan?.newCards ? chapterSubject.get(plan.newCards.chapterId)?.id : undefined,
        plan?.quizChapterId ? chapterSubject.get(plan.quizChapterId)?.id : undefined,
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const finishStage = (from: Stage) => {
    void invalidateProgress(qc);
    if (from === "cards" && plan?.quizChapterId) {
      setStage("quiz");
      return;
    }
    setDoneAt(Date.now());
    setStage("done");
    void awardBadgesIfNeeded();
  };

  if (current === "cards" && cards) {
    return (
      <FlashcardDeck
        cards={cards}
        title="Today's review"
        onExit={exit}
        onFinish={({ reviewed: n }) => {
          setReviewed(n);
          finishStage("cards");
        }}
      />
    );
  }

  if (current === "quiz" && plan?.quizChapterId) {
    return (
      <ChapterQuiz
        chapterId={plan.quizChapterId}
        subjectName={chapterSubject.get(plan.quizChapterId)?.name}
        onExit={reviewed > 0 ? () => finishStage("quiz") : exit}
        onComplete={() => {
          setQuizzes(1);
          finishStage("quiz");
        }}
      />
    );
  }

  if (reviewed === 0 && quizzes === 0) {
    return (
      <div className="mt-6 rounded-[24px] border bg-card p-6 text-center">
        <h1 className="font-display text-[26px]">Done for today.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tomorrow's cards will be ready in the morning.
        </p>
        <button
          onClick={exit}
          className="mt-5 h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          Back to Today
        </button>
      </div>
    );
  }

  const parts = [
    reviewed > 0 && `${reviewed} card${reviewed === 1 ? "" : "s"}`,
    quizzes > 0 && "1 quiz",
  ].filter(Boolean);
  return (
    <SessionComplete
      before={before}
      after={dataUpdatedAt > doneAt ? snapshot : undefined}
      subjectIds={studiedSubjectIds}
      label={`Session complete · ${parts.join(" · ")}`}
      onDone={exit}
    />
  );
}
