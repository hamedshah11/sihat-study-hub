import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Sparkles, BookOpen, Layers, ClipboardList, MessageCircle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — Sihat" }] }),
  component: HomePage,
});

type Recommendation =
  | { kind: "flashcards"; chapterId: string; chapterTitle: string; dueCount: number; quizPending?: { chapterId: string; chapterTitle: string } }
  | { kind: "quiz"; chapterId: string; chapterTitle: string }
  | { kind: "chapter"; chapterId: string; chapterTitle: string; subjectName: string | null }
  | { kind: "empty" };

function estimateMinutes(rec: Recommendation): number {
  if (rec.kind === "flashcards") return Math.max(3, Math.ceil(rec.dueCount * 0.5)) + (rec.quizPending ? 5 : 0);
  if (rec.kind === "quiz") return 5;
  if (rec.kind === "chapter") return 8;
  return 0;
}

function HomePage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["home-today"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const uid = user.id;
      const todayIso = new Date().toISOString().slice(0, 10);

      const [
        { data: profile },
        { data: streak },
        { data: xpRows },
        { data: dueReviews },
        { data: progressRows },
      ] = await Promise.all([
        supabase.from("profiles").select("display_name, batch_id").eq("id", uid).maybeSingle(),
        supabase.from("streaks").select("current_streak").eq("user_id", uid).maybeSingle(),
        supabase.from("xp_events").select("amount").eq("user_id", uid),
        supabase
          .from("flashcard_reviews")
          .select("flashcard_id, next_review_at")
          .eq("user_id", uid)
          .lte("next_review_at", todayIso),
        supabase.from("chapter_progress").select("chapter_id, mastery_score, completed_at, last_attempt_at").eq("user_id", uid),
      ]);

      const xpTotal = (xpRows ?? []).reduce((acc, r: any) => acc + (r.amount ?? 0), 0);

      // 1) Due flashcards — group by chapter, pick chapter with most due
      let dueChapter: { chapterId: string; chapterTitle: string; dueCount: number } | null = null;
      if (dueReviews && dueReviews.length > 0) {
        const ids = dueReviews.map((r: any) => r.flashcard_id);
        const { data: cards } = await supabase
          .from("flashcards")
          .select("id, chapter_id")
          .in("id", ids)
          .eq("status", "approved");
        const counts = new Map<string, number>();
        for (const c of cards ?? []) {
          if (!c.chapter_id) continue;
          counts.set(c.chapter_id, (counts.get(c.chapter_id) ?? 0) + 1);
        }
        if (counts.size > 0) {
          const [topChapterId, dueCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
          const { data: ch } = await supabase
            .from("chapters")
            .select("id, title")
            .eq("id", topChapterId)
            .maybeSingle();
          if (ch) dueChapter = { chapterId: ch.id, chapterTitle: ch.title, dueCount };
        }
      }

      // 2) Unfinished quiz — chapter_progress with attempts? We don't have attempts column reliably; use mastery_score < 80 and not completed
      const unfinishedProgress = (progressRows ?? []).find(
        (p: any) => !p.completed_at && (p.mastery_score ?? 0) > 0
      );
      let unfinishedQuiz: { chapterId: string; chapterTitle: string } | null = null;
      if (unfinishedProgress) {
        const { data: ch } = await supabase
          .from("chapters")
          .select("id, title, status")
          .eq("id", unfinishedProgress.chapter_id)
          .maybeSingle();
        if (ch && ch.status === "published") {
          unfinishedQuiz = { chapterId: ch.id, chapterTitle: ch.title };
        }
      }

      // 3) Next published chapter from student's current semester (batch -> semester -> subjects -> chapters)
      let nextChapter: { chapterId: string; chapterTitle: string; subjectName: string | null } | null = null;
      const completedIds = new Set((progressRows ?? []).filter((p: any) => p.completed_at).map((p: any) => p.chapter_id));
      let subjectIds: string[] = [];
      if (profile?.batch_id) {
        const { data: batch } = await supabase
          .from("batches")
          .select("current_semester_id")
          .eq("id", profile.batch_id)
          .maybeSingle();
        if (batch?.current_semester_id) {
          const { data: subjects } = await supabase
            .from("subjects")
            .select("id, name")
            .eq("semester_id", batch.current_semester_id);
          subjectIds = (subjects ?? []).map((s: any) => s.id);
          if (subjectIds.length) {
            const { data: chapters } = await supabase
              .from("chapters")
              .select("id, title, subject_id, display_order")
              .in("subject_id", subjectIds)
              .eq("status", "published")
              .order("display_order", { ascending: true });
            const next = (chapters ?? []).find((c: any) => !completedIds.has(c.id));
            if (next) {
              const subj = (subjects ?? []).find((s: any) => s.id === next.subject_id);
              nextChapter = { chapterId: next.id, chapterTitle: next.title, subjectName: subj?.name ?? null };
            }
          }
        }
      }
      // Fallback: any published chapter
      if (!nextChapter) {
        const { data: chapters } = await supabase
          .from("chapters")
          .select("id, title, subject_id")
          .eq("status", "published")
          .order("display_order", { ascending: true })
          .limit(20);
        const next = (chapters ?? []).find((c: any) => !completedIds.has(c.id));
        if (next) {
          const { data: subj } = next.subject_id
            ? await supabase.from("subjects").select("name").eq("id", next.subject_id).maybeSingle()
            : { data: null };
          nextChapter = { chapterId: next.id, chapterTitle: next.title, subjectName: subj?.name ?? null };
        }
      }

      let recommendation: Recommendation;
      if (dueChapter) {
        recommendation = {
          kind: "flashcards",
          ...dueChapter,
          quizPending: unfinishedQuiz ?? undefined,
        };
      } else if (unfinishedQuiz) {
        recommendation = { kind: "quiz", ...unfinishedQuiz };
      } else if (nextChapter) {
        recommendation = { kind: "chapter", ...nextChapter };
      } else {
        recommendation = { kind: "empty" };
      }

      return {
        name: profile?.display_name || "there",
        streak: streak?.current_streak ?? 0,
        xpTotal,
        recommendation,
        continueChapter: nextChapter,
      };
    },
  });

  const rec = data?.recommendation;

  function recHeadline(): string {
    if (!rec) return "";
    if (rec.kind === "flashcards") {
      const base = `Today: ${rec.dueCount} flashcard${rec.dueCount === 1 ? "" : "s"} due`;
      return rec.quizPending ? `${base} and 1 quiz on ${rec.quizPending.chapterTitle}` : `${base} in ${rec.chapterTitle}`;
    }
    if (rec.kind === "quiz") return `Today: finish your quiz on ${rec.chapterTitle}`;
    if (rec.kind === "chapter") return `Today: start ${rec.chapterTitle}`;
    return "You're all caught up";
  }

  function startStudying() {
    if (!rec || rec.kind === "empty") return;
    if (rec.kind === "flashcards" || rec.kind === "quiz" || rec.kind === "chapter") {
      navigate({ to: "/chapters/$chapterId", params: { chapterId: rec.chapterId } });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-44 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  const minutes = rec ? estimateMinutes(rec) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Hello,</p>
          <h1 className="text-2xl font-bold text-primary">{data?.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
            <Flame className="size-4 text-accent" />
            <span className="text-sm font-semibold">{data?.streak ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
            <Sparkles className="size-4 text-accent" />
            <span className="text-sm font-semibold">{data?.xpTotal ?? 0} XP</span>
          </div>
        </div>
      </header>

      {/* Main card */}
      {rec?.kind === "empty" ? (
        <section className="rounded-2xl bg-surface p-6 text-center">
          <div className="mx-auto inline-flex items-center justify-center rounded-full bg-muted p-4 text-muted-foreground">
            <Sparkles className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-primary">You're all caught up</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No flashcards due and no new chapters right now. Browse subjects to explore more.
          </p>
          <Link
            to="/subjects"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Browse subjects <ArrowRight className="size-4" />
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-sm">
          <p className="text-xs uppercase tracking-wide opacity-80">Your session</p>
          <h2 className="mt-1 text-xl font-bold leading-snug">{recHeadline()}</h2>
          <p className="mt-2 text-sm opacity-90">Estimated time: {minutes} minute{minutes === 1 ? "" : "s"}</p>
          <button
            onClick={startStudying}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-background text-primary px-5 py-3 text-sm font-semibold"
          >
            Start studying <ArrowRight className="size-4" />
          </button>
        </section>
      )}

      {/* Secondary cards */}
      <section className="grid grid-cols-2 gap-3">
        <SecondaryCard
          icon={<BookOpen className="size-5" />}
          label="Continue chapter"
          sublabel={data?.continueChapter?.chapterTitle ?? "Browse subjects"}
          to={data?.continueChapter ? "/chapters/$chapterId" : "/subjects"}
          params={data?.continueChapter ? { chapterId: data.continueChapter.chapterId } : undefined}
        />
        <SecondaryCard
          icon={<Layers className="size-5" />}
          label="Review flashcards"
          sublabel={rec?.kind === "flashcards" ? `${rec.dueCount} due today` : "Open a chapter"}
          to={rec?.kind === "flashcards" ? "/chapters/$chapterId" : "/subjects"}
          params={rec?.kind === "flashcards" ? { chapterId: rec.chapterId } : undefined}
        />
        <SecondaryCard
          icon={<ClipboardList className="size-5" />}
          label="Take a quiz"
          sublabel={rec?.kind === "quiz" ? rec.chapterTitle : "Test yourself"}
          to={rec?.kind === "quiz" ? "/chapters/$chapterId" : "/subjects"}
          params={rec?.kind === "quiz" ? { chapterId: rec.chapterId } : undefined}
        />
        <SecondaryCard
          icon={<MessageCircle className="size-5" />}
          label="Ask tutor"
          sublabel={data?.continueChapter?.chapterTitle ?? "Pick a chapter"}
          to={data?.continueChapter ? "/chapters/$chapterId" : "/subjects"}
          params={data?.continueChapter ? { chapterId: data.continueChapter.chapterId } : undefined}
        />
      </section>
    </div>
  );
}

function SecondaryCard({
  icon,
  label,
  sublabel,
  to,
  params,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  to: string;
  params?: Record<string, string>;
}) {
  return (
    <Link
      to={to as any}
      params={params as any}
      className="flex flex-col gap-2 rounded-xl bg-surface p-4 active:scale-[0.98] transition"
    >
      <div className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{sublabel}</p>
      </div>
    </Link>
  );
}
