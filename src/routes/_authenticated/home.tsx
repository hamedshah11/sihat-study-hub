import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Sparkles, BookOpen, Layers, ClipboardList, MessageCircle, ArrowRight, Trophy } from "lucide-react";
import { levelFromXp } from "@/lib/levels";
import { checkLevelUp } from "@/lib/celebrate";
import { InstallPrompt } from "@/components/InstallPrompt";

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
        { data: leaderboard },
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

      // Leaderboard peek: find my rank and gap to next spot
      const rows = (leaderboard ?? []) as Array<{ user_id: string; first_name: string | null; weekly_xp: number }>;
      let peek: { rank: number; gap: number; total: number; batchName: string | null } | null = null;
      if (rows.length) {
        const idx = rows.findIndex((r) => r.user_id === uid);
        if (idx >= 0) {
          let batchName: string | null = null;
          if (profile?.batch_id) {
            const { data: b } = await supabase.from("batches").select("name").eq("id", profile.batch_id).maybeSingle();
            batchName = b?.name ?? null;
          }
          const gap = idx === 0 ? 0 : rows[idx - 1].weekly_xp - rows[idx].weekly_xp;
          peek = { rank: idx + 1, gap, total: rows.length, batchName };
        }
      }

      return {
        name: profile?.display_name || "there",
        streak: streak?.current_streak ?? 0,
        xpTotal,
        recommendation,
        continueChapter: nextChapter,
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="animate-fade-up flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="font-display text-[26px] font-bold text-primary">{data?.name}</h1>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-streak/30 bg-streak/10 px-3.5 py-2 text-streak shadow-soft">
          <Flame className={`size-4 ${(data?.streak ?? 0) > 0 ? "animate-flame fill-streak/30" : ""}`} />
          <span className="text-sm font-bold tabular-nums">{data?.streak ?? 0}</span>
        </div>
      </header>

      <InstallPrompt />


      {/* Level bar */}
      {(() => {
        const lvl = levelFromXp(data?.xpTotal ?? 0);
        const pct = lvl.xpForLevel > 0 ? Math.min(100, (lvl.xpIntoLevel / lvl.xpForLevel) * 100) : 0;
        return (
          <section className="animate-fade-up stagger-1 rounded-2xl border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-semibold text-primary">
                <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-primary text-[11px] font-bold text-primary-foreground">
                  {lvl.level}
                </span>
                {lvl.name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {lvl.xpIntoLevel} / {lvl.xpForLevel} XP
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="progress-shine h-full rounded-full bg-gradient-to-r from-accent to-accent/70 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </section>
        );
      })()}

      {/* Leaderboard peek */}
      {data?.peek && (
        <Link
          to="/leaderboard"
          className="animate-fade-up stagger-2 group flex items-center justify-between rounded-2xl border bg-card px-4 py-3.5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lifted"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
              <Trophy className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                You're #{data.peek.rank}{data.peek.batchName ? ` in ${data.peek.batchName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.peek.rank === 1
                  ? "Leading this week"
                  : `${data.peek.gap} XP behind the next spot`}
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
        </Link>
      )}

      {/* Main card */}
      {rec?.kind === "empty" ? (
        <section className="animate-fade-up stagger-3 rounded-2xl border bg-card p-6 text-center shadow-soft">
          <div className="mx-auto inline-flex items-center justify-center rounded-full bg-accent/10 p-4 text-accent">
            <Sparkles className="size-6" />
          </div>
          <h2 className="mt-3 font-display text-lg font-bold text-primary">You're all caught up</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No flashcards due and no new chapters right now. Browse subjects to explore more.
          </p>
          <Link
            to="/subjects"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Browse subjects <ArrowRight className="size-4" />
          </Link>
        </section>
      ) : (
        <section className="hero-gradient animate-fade-up stagger-3 rounded-2xl p-6 text-primary-foreground shadow-lifted">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest opacity-80">
            <Sparkles className="size-3.5" /> Your session
          </p>
          <h2 className="font-display mt-2 text-xl font-bold leading-snug">{recHeadline()}</h2>
          <p className="mt-2 text-sm opacity-80">Estimated time: {minutes} minute{minutes === 1 ? "" : "s"}</p>
          <button
            onClick={startStudying}
            className="relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-background px-5 py-3.5 text-sm font-bold text-primary shadow-lifted transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Start studying <ArrowRight className="size-4" />
          </button>
        </section>
      )}

      {/* Secondary cards */}
      <section className="grid grid-cols-2 gap-3">
        <SecondaryCard
          tone="navy"
          stagger="stagger-3"
          icon={<BookOpen className="size-5" />}
          label="Continue chapter"
          sublabel={data?.continueChapter?.chapterTitle ?? "Browse subjects"}
          to={data?.continueChapter ? "/chapters/$chapterId" : "/subjects"}
          params={data?.continueChapter ? { chapterId: data.continueChapter.chapterId } : undefined}
        />
        <SecondaryCard
          tone="teal"
          stagger="stagger-4"
          icon={<Layers className="size-5" />}
          label="Review flashcards"
          sublabel={rec?.kind === "flashcards" ? `${rec.dueCount} due today` : "Open a chapter"}
          to={rec?.kind === "flashcards" ? "/chapters/$chapterId" : "/subjects"}
          params={rec?.kind === "flashcards" ? { chapterId: rec.chapterId } : undefined}
        />
        <SecondaryCard
          tone="amber"
          stagger="stagger-5"
          icon={<ClipboardList className="size-5" />}
          label="Take a quiz"
          sublabel={rec?.kind === "quiz" ? rec.chapterTitle : "Test yourself"}
          to={rec?.kind === "quiz" ? "/chapters/$chapterId" : "/subjects"}
          params={rec?.kind === "quiz" ? { chapterId: rec.chapterId } : undefined}
        />
        <SecondaryCard
          tone="violet"
          stagger="stagger-6"
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

const CARD_TONES = {
  navy: { bg: "rgba(31,58,95,0.08)", fg: "#1F3A5F" },
  teal: { bg: "rgba(45,157,155,0.10)", fg: "#1F7A78" },
  amber: { bg: "rgba(217,119,6,0.10)", fg: "#92400E" },
  violet: { bg: "rgba(124,58,237,0.10)", fg: "#5B21B6" },
} as const;

function SecondaryCard({
  tone,
  stagger,
  icon,
  label,
  sublabel,
  to,
  params,
}: {
  tone: keyof typeof CARD_TONES;
  stagger: string;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  to: string;
  params?: Record<string, string>;
}) {
  const t = CARD_TONES[tone];
  return (
    <Link
      to={to as any}
      params={params as any}
      className={`card-lift animate-fade-up ${stagger} flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft`}
    >
      <div
        className="inline-flex size-10 items-center justify-center rounded-xl"
        style={{ background: t.bg, color: t.fg }}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{sublabel}</p>
      </div>
    </Link>
  );
}
