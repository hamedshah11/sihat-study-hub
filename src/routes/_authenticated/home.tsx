import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import * as Icons from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Flame,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { levelFromXp } from "@/lib/levels";
import { displayStreak } from "@/lib/streak";
import { useMistakes } from "@/lib/mistakes-data";
import { checkLevelUp } from "@/lib/celebrate";
import { InstallPrompt } from "@/components/InstallPrompt";
import { subjectColourVariables } from "@/lib/subject-colours";

function toPascal(value: string) {
  return value
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
}

function SubjectIcon({ name }: { name?: string | null }) {
  const key = name ? toPascal(name) : "";
  const Icon =
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[key] ||
    BookOpen;
  return <Icon className="size-5" />;
}

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — Sihat" }] }),
  component: HomePage,
});

type Recommendation =
  | {
      kind: "flashcards";
      chapterId: string;
      chapterTitle: string;
      dueCount: number;
      quizPending?: { chapterId: string; chapterTitle: string };
    }
  | { kind: "quiz"; chapterId: string; chapterTitle: string }
  | { kind: "chapter"; chapterId: string; chapterTitle: string; subjectName: string | null }
  | { kind: "empty" };

function estimateMinutes(rec: Recommendation): number {
  if (rec.kind === "flashcards")
    return Math.max(3, Math.ceil(rec.dueCount * 0.5)) + (rec.quizPending ? 5 : 0);
  if (rec.kind === "quiz") return 5;
  if (rec.kind === "chapter") return 8;
  return 0;
}

function HomePage() {
  const navigate = useNavigate();
  const { data: mistakes } = useMistakes();

  const { data, isLoading } = useQuery({
    queryKey: ["home-today"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const uid = user.id;
      const nowIso = new Date().toISOString();

      const [
        { data: profile },
        { data: streak },
        { data: xpRows },
        { data: dueReviews },
        { data: progressRows },
        { data: leaderboard },
      ] = await Promise.all([
        supabase.from("profiles").select("display_name, batch_id").eq("id", uid).maybeSingle(),
        supabase
          .from("streaks")
          .select("current_streak, last_active_date, freezes_available")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase.from("xp_events").select("amount").eq("user_id", uid),
        supabase
          .from("flashcard_reviews")
          .select("flashcard_id, due_at")
          .eq("user_id", uid)
          .lte("due_at", nowIso),
        supabase
          .from("chapter_progress")
          .select("chapter_id, mastery_score, completed_at, last_attempt_at")
          .eq("user_id", uid),
        supabase.rpc("batch_weekly_leaderboard"),
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
        (p: any) => !p.completed_at && (p.mastery_score ?? 0) > 0,
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
      let nextChapter: {
        chapterId: string;
        chapterTitle: string;
        subjectName: string | null;
      } | null = null;
      let continueSubjects: Array<{
        id: string;
        name: string;
        icon: string | null;
        colour: string | null;
        nextChapter: { id: string; title: string; displayOrder: number | null } | null;
        completed: number;
        chapterCount: number;
        lastActivity: string | null;
      }> = [];
      const completedIds = new Set(
        (progressRows ?? []).filter((p: any) => p.completed_at).map((p: any) => p.chapter_id),
      );
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
            .select("id, name, icon, colour, display_order")
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
              nextChapter = {
                chapterId: next.id,
                chapterTitle: next.title,
                subjectName: subj?.name ?? null,
              };
            }
            continueSubjects = (subjects ?? [])
              .map((subject: any) => {
                const subjectChapters = (chapters ?? []).filter(
                  (chapter: any) => chapter.subject_id === subject.id,
                );
                const subjectChapterIds = new Set(
                  subjectChapters.map((chapter: any) => chapter.id),
                );
                const subjectProgress = (progressRows ?? []).filter((progress: any) =>
                  subjectChapterIds.has(progress.chapter_id),
                );
                const unfinished = subjectChapters.find(
                  (chapter: any) => !completedIds.has(chapter.id),
                );
                const lastActivity =
                  subjectProgress
                    .map((progress: any) => progress.last_attempt_at ?? progress.completed_at)
                    .filter(Boolean)
                    .sort()
                    .at(-1) ?? null;
                return {
                  id: subject.id,
                  name: subject.name,
                  icon: subject.icon,
                  colour: subject.colour,
                  nextChapter: unfinished
                    ? {
                        id: unfinished.id,
                        title: unfinished.title,
                        displayOrder: unfinished.display_order,
                      }
                    : null,
                  completed: subjectChapters.filter((chapter: any) => completedIds.has(chapter.id))
                    .length,
                  chapterCount: subjectChapters.length,
                  lastActivity,
                  displayOrder: subject.display_order ?? 0,
                };
              })
              .sort(
                (a, b) =>
                  (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "") ||
                  a.displayOrder - b.displayOrder,
              );
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
          nextChapter = {
            chapterId: next.id,
            chapterTitle: next.title,
            subjectName: subj?.name ?? null,
          };
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

      // Leaderboard peek: find my rank and gap to next spot
      const rows = (leaderboard ?? []) as Array<{
        user_id: string;
        first_name: string | null;
        weekly_xp: number;
      }>;
      let peek: {
        rank: number;
        gap: number;
        total: number;
        batchName: string | null;
        nextName: string | null;
      } | null = null;
      if (rows.length) {
        const idx = rows.findIndex((r) => r.user_id === uid);
        if (idx >= 0) {
          let batchName: string | null = null;
          if (profile?.batch_id) {
            const { data: b } = await supabase
              .from("batches")
              .select("name")
              .eq("id", profile.batch_id)
              .maybeSingle();
            batchName = b?.name ?? null;
          }
          const gap = idx === 0 ? 0 : rows[idx - 1].weekly_xp - rows[idx].weekly_xp;
          peek = {
            rank: idx + 1,
            gap,
            total: rows.length,
            batchName,
            nextName: idx === 0 ? null : rows[idx - 1].first_name,
          };
        }
      }

      return {
        name: profile?.display_name || "there",
        streak: displayStreak(streak),
        xpTotal,
        recommendation,
        continueSubjects,
        peek,
      };
    },
  });

  const rec = data?.recommendation;

  // Celebrate level-ups (fires once per detected increase, throttled inside celebrate).
  useEffect(() => {
    if (typeof data?.xpTotal !== "number") return;
    const lvl = levelFromXp(data.xpTotal).level;
    checkLevelUp(lvl);
  }, [data?.xpTotal]);

  function recHeadline(): string {
    if (!rec) return "";
    if (rec.kind === "flashcards") {
      return `${rec.dueCount} card${rec.dueCount === 1 ? "" : "s"} to review`;
    }
    if (rec.kind === "quiz") return `Finish your quiz on ${rec.chapterTitle}`;
    if (rec.kind === "chapter") return `Start ${rec.chapterTitle}`;
    return "You're all caught up";
  }

  function startStudying() {
    if (!rec || rec.kind === "empty") return;
    if (rec.kind === "flashcards" || rec.kind === "quiz" || rec.kind === "chapter") {
      const tab =
        rec.kind === "flashcards" ? "flashcards" : rec.kind === "quiz" ? "quiz" : undefined;
      navigate({
        to: "/chapters/$chapterId",
        params: { chapterId: rec.chapterId },
        search: { tab },
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-[250px] rounded-[30px]" />
        <Skeleton className="h-[170px] rounded-3xl" />
      </div>
    );
  }

  const minutes = rec ? estimateMinutes(rec) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const firstName = data?.name.trim().split(/\s+/)[0] || "there";

  return (
    <div className="mx-auto max-w-3xl space-y-[22px] pb-4">
      {/* Header */}
      <header className="animate-fade-up flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="font-display text-[40px] leading-[1.05] text-foreground">{firstName}</h1>
        </div>
        <div className="flex h-[38px] items-center gap-1.5 rounded-full bg-streak/10 px-3.5 text-streak">
          <Flame
            className={`size-4 ${(data?.streak ?? 0) > 0 ? "animate-flame fill-streak/30" : ""}`}
          />
          <span className="text-sm font-bold tabular-nums">{data?.streak ?? 0}</span>
        </div>
      </header>

      <InstallPrompt />

      <section className="animate-fade-up stagger-1 relative flex h-[250px] flex-col overflow-hidden rounded-[30px] bg-primary p-[22px] text-primary-foreground">
        <span
          aria-hidden
          className="absolute -right-14 -top-16 size-[190px] rounded-full bg-sky-400/90"
        />
        <span
          aria-hidden
          className="animate-float-slow absolute right-[30px] top-10 size-[110px] rounded-full bg-violet-500/95"
        />
        <span
          aria-hidden
          className="absolute -right-5 top-[92px] size-20 rounded-full bg-sky-400/90"
        />
        <p className="relative flex items-center gap-1.5 text-xs font-semibold text-blue-100">
          <Sparkles className="size-3.5" /> Today
        </p>
        <h2
          className={`relative mt-4 max-w-[75%] font-bold leading-[1.05] ${rec?.kind === "flashcards" ? "text-[42px]" : "font-display text-[30px]"}`}
        >
          {recHeadline()}
        </h2>
        <p className="relative mt-1 text-sm text-blue-100">
          {rec?.kind === "empty"
            ? "No reviews or unfinished chapters right now"
            : `About ${minutes} minute${minutes === 1 ? "" : "s"}`}
        </p>
        {rec?.kind === "empty" ? (
          <Link
            to="/subjects"
            className="relative mt-auto flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-primary"
          >
            Browse subjects <ArrowRight className="size-4" />
          </Link>
        ) : (
          <button
            onClick={startStudying}
            className="relative mt-auto flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-primary"
          >
            Start studying <ArrowRight className="size-4" />
          </button>
        )}
      </section>

      {/* Mistakes due for review (only shown when there are some). */}
      {(mistakes?.due.length ?? 0) > 0 && (
        <Link
          to="/review"
          className="animate-fade-up stagger-2 group flex items-center gap-3 rounded-[20px] border bg-card px-3.5 py-3"
        >
          <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-streak/10 text-streak">
            <RotateCcw className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              Fix {mistakes!.due.length} mistake{mistakes!.due.length === 1 ? "" : "s"}
            </span>
          </span>
          <ChevronRight className="size-[18px] shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <section className="space-y-3">
        <div className="animate-fade-up stagger-2 flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold">Continue learning</h2>
          <Link to="/subjects" className="text-[13px] font-semibold text-primary">
            All subjects
          </Link>
        </div>
        <div className="-mr-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(data?.continueSubjects ?? []).map((subject, index) => {
            const percentage = subject.chapterCount
              ? (subject.completed / subject.chapterCount) * 100
              : 0;
            const linkProps = subject.nextChapter
              ? ({
                  to: "/chapters/$chapterId",
                  params: { chapterId: subject.nextChapter.id },
                } as const)
              : ({ to: "/subjects/$subjectId", params: { subjectId: subject.id } } as const);
            return (
              <Link
                {...linkProps}
                key={subject.id}
                style={subjectColourVariables(subject.colour)}
                className={`subject-colour animate-fade-up stagger-${Math.min(index + 3, 6)} relative flex h-[170px] w-[150px] shrink-0 snap-start flex-col overflow-hidden rounded-3xl bg-[var(--subject)] p-3.5 text-white`}
              >
                <span
                  aria-hidden
                  className="absolute -right-[30px] -top-[30px] size-24 rounded-full bg-white/10"
                />
                <span className="relative grid size-[38px] place-items-center rounded-xl bg-white/20">
                  <SubjectIcon name={subject.icon} />
                </span>
                <span className="relative mt-auto text-[15px] font-bold leading-tight line-clamp-2">
                  {subject.name}
                </span>
                <span className="relative my-2 truncate text-xs text-white/85">
                  {subject.nextChapter
                    ? `${subject.nextChapter.displayOrder ? `Ch ${subject.nextChapter.displayOrder} · ` : ""}${subject.nextChapter.title}`
                    : "All chapters complete"}
                </span>
                <span className="relative h-[5px] overflow-hidden rounded-full bg-white/25">
                  <span
                    className="block h-full rounded-full bg-white transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {data?.peek && (
        <Link
          to="/leaderboard"
          className="animate-fade-up stagger-6 group flex items-center gap-3 rounded-[20px] border bg-card px-3.5 py-3 text-foreground"
        >
          <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Trophy className="size-[19px]" />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <strong>#{data.peek.rank} this week</strong>{" "}
            <span className="text-muted-foreground">
              ·{" "}
              {data.peek.rank === 1
                ? "Leading the leaderboard"
                : `${data.peek.gap} XP to pass ${data.peek.nextName ?? "the next student"}`}
            </span>
          </span>
          <ChevronRight className="size-[18px] shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
