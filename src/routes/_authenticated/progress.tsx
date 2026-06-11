import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Sparkles, ClipboardList, Layers, AlertCircle, ArrowRight, Trophy, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({ meta: [{ title: "Progress — Sihat" }] }),
  component: ProgressPage,
});

type ChapterMastery = {
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectName: string;
  masteryScore: number | null;
  completedAt: string | null;
};

function ProgressPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["student-progress"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const uid = user.id;

      const [
        { data: streak },
        { data: xpRows },
        { data: quizAttempts },
        { data: flashcardReviews },
        { data: progressRows },
      ] = await Promise.all([
        supabase.from("streaks").select("current_streak, longest_streak").eq("user_id", uid).maybeSingle(),
        supabase.from("xp_events").select("amount").eq("user_id", uid),
        supabase.from("quiz_attempts").select("score, total_questions").eq("user_id", uid),
        supabase.from("flashcard_reviews").select("reps").eq("user_id", uid).gt("reps", 0),
        supabase.from("chapter_progress").select("chapter_id, mastery_score, completed_at").eq("user_id", uid),
      ]);

      const xpTotal = (xpRows ?? []).reduce((acc, r: any) => acc + (r.amount ?? 0), 0);
      const quizzesCompleted = (quizAttempts ?? []).length;
      const pctSum = (quizAttempts as any[] ?? []).reduce((acc, q) => {
        const total = Number(q.total_questions ?? 0);
        if (!total) return acc;
        return acc + (Number(q.score ?? 0) / total) * 100;
      }, 0);
      const avgScore = quizzesCompleted > 0 ? Math.round(pctSum / quizzesCompleted) : 0;
      const cardsReviewed = (flashcardReviews ?? []).length;

      // Fetch chapter and subject names for progress rows
      const chapterIds = (progressRows ?? []).map((p: any) => p.chapter_id);
      let chaptersData: any[] = [];
      let subjectsData: any[] = [];
      if (chapterIds.length > 0) {
        const { data: chs } = await supabase
          .from("chapters")
          .select("id, title, subject_id")
          .in("id", chapterIds)
          .eq("status", "published");
        chaptersData = chs ?? [];
        const subjectIds = [...new Set(chaptersData.map((c) => c.subject_id).filter(Boolean))];
        if (subjectIds.length > 0) {
          const { data: subs } = await supabase.from("subjects").select("id, name").in("id", subjectIds);
          subjectsData = subs ?? [];
        }
      }

      const chapterMap = new Map(chaptersData.map((c) => [c.id, c]));
      const subjectMap = new Map(subjectsData.map((s) => [s.id, s]));

      const masteryList: ChapterMastery[] = (progressRows ?? []).map((p: any) => {
        const ch = chapterMap.get(p.chapter_id);
        const subj = ch?.subject_id ? subjectMap.get(ch.subject_id) : null;
        return {
          chapterId: p.chapter_id,
          chapterTitle: ch?.title ?? "Unknown chapter",
          subjectId: ch?.subject_id ?? "",
          subjectName: subj?.name ?? "Unknown subject",
          masteryScore: p.mastery_score ?? null,
          completedAt: p.completed_at ?? null,
        };
      });

      // Group by subject
      const bySubject = new Map<string, ChapterMastery[]>();
      for (const m of masteryList) {
        const list = bySubject.get(m.subjectName) ?? [];
        list.push(m);
        bySubject.set(m.subjectName, list);
      }
      // Sort subjects alphabetically and chapters by mastery desc
      const grouped = [...bySubject.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([subjectName, chapters]) => ({
          subjectName,
          chapters: chapters.sort((a, b) => (b.masteryScore ?? -1) - (a.masteryScore ?? -1)),
        }));

      // Weak areas
      const weak = masteryList
        .filter((m) => (m.masteryScore ?? 0) < 60)
        .sort((a, b) => (a.masteryScore ?? -1) - (b.masteryScore ?? -1));

      return {
        streak: streak?.current_streak ?? 0,
        longestStreak: streak?.longest_streak ?? 0,
        xpTotal,
        quizzesCompleted,
        avgScore,
        cardsReviewed,
        grouped,
        weak,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const weak = data?.weak ?? [];

  return (
    <div className="space-y-6">
      <h1 className="animate-fade-up font-display text-[26px] font-bold text-primary tracking-tight">Your Progress</h1>

      {/* Hero tiles */}
      <section className="animate-fade-up stagger-1 grid grid-cols-2 gap-3">
        <HeroTile
          tone="streak"
          icon={<Flame className="size-6" />}
          label="Current streak"
          value={`${data?.streak ?? 0}`}
          suffix={`day${(data?.streak ?? 0) === 1 ? "" : "s"}`}
        />
        <HeroTile
          tone="accent"
          icon={<Sparkles className="size-6" />}
          label="Total XP"
          value={`${data?.xpTotal ?? 0}`}
          suffix="XP"
        />
      </section>

      {/* Secondary 2x2 */}
      <section className="animate-fade-up stagger-2 grid grid-cols-2 gap-3">
        <StatCard
          icon={<ClipboardList className="size-5" />}
          label="Quizzes done"
          value={`${data?.quizzesCompleted ?? 0}`}
        />
        <StatCard
          icon={<Target className="size-5" />}
          label="Avg score"
          value={`${data?.avgScore ?? 0}%`}
        />
        <StatCard
          icon={<Layers className="size-5" />}
          label="Cards reviewed"
          value={`${data?.cardsReviewed ?? 0}`}
        />
        <StatCard
          icon={<Trophy className="size-5" />}
          label="Best streak"
          value={`${data?.longestStreak ?? 0}`}
          suffix={`day${(data?.longestStreak ?? 0) === 1 ? "" : "s"}`}
        />
      </section>


      {/* Weak areas */}
      {weak.length > 0 && (
        <section className="animate-fade-up stagger-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="size-4" />
            </span>
            <h2 className="text-base font-semibold text-foreground">Weak areas</h2>
          </div>
          <div className="space-y-2">
            {weak.slice(0, 5).map((w) => (
              <div
                key={w.chapterId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-l-4 border-l-destructive/50 bg-card p-4 shadow-soft"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{w.chapterTitle}</p>
                  <p className="text-xs text-muted-foreground">{w.subjectName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-destructive">{w.masteryScore ?? 0}%</span>
                  <Link
                    to="/chapters/$chapterId"
                    params={{ chapterId: w.chapterId }}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    Study <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Chapter mastery */}
      <section className="animate-fade-up stagger-4 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Chapter mastery</h2>
        {data?.grouped && data.grouped.length > 0 ? (
          <div className="space-y-5">
            {data.grouped.map((g) => (
              <div key={g.subjectName} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {g.subjectName}
                </h3>
                <div className="space-y-2">
                  {g.chapters.map((ch) => (
                    <div
                      key={ch.chapterId}
                      className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-lifted"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{ch.chapterTitle}</p>
                        <div className="mt-1.5 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-accent to-accent/70 transition-all duration-700"
                            style={{ width: `${Math.max(0, Math.min(100, ch.masteryScore ?? 0))}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <MasteryBadge score={ch.masteryScore} />
                        <Link
                          to="/chapters/$chapterId"
                          params={{ chapterId: ch.chapterId }}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/80"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-surface p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No chapters started yet. Head to the home screen to begin studying.
            </p>
            <Link
              to="/home"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Start studying <ArrowRight className="size-4" />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="card-lift flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft">
      <div className="inline-flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
        {icon}
      </div>
      <div>
        <p className="font-display text-lg font-bold text-foreground tabular-nums">
          {value}
          {suffix && <span className="ml-1 font-sans text-xs font-medium text-muted-foreground">{suffix}</span>}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function HeroTile({
  tone,
  icon,
  label,
  value,
  suffix,
}: {
  tone: "streak" | "accent";
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
}) {
  const isStreak = tone === "streak";
  return (
    <div
      className="card-lift relative overflow-hidden rounded-2xl border p-5 shadow-soft"
      style={
        isStreak
          ? { background: "linear-gradient(135deg, rgba(249,115,22,0.14), rgba(249,115,22,0.04))", borderColor: "rgba(249,115,22,0.25)" }
          : { background: "linear-gradient(135deg, rgba(45,157,155,0.14), rgba(45,157,155,0.04))", borderColor: "rgba(45,157,155,0.25)" }
      }
    >
      <div
        aria-hidden
        className="absolute -bottom-5 -right-4 opacity-[0.1] [&>svg]:size-24"
        style={{ color: isStreak ? "#C2410C" : "#0F766E" }}
      >
        {icon}
      </div>
      <div
        className="inline-flex size-11 items-center justify-center rounded-xl shadow-soft"
        style={
          isStreak
            ? { background: "rgba(249,115,22,0.18)", color: "#C2410C" }
            : { background: "rgba(45,157,155,0.18)", color: "#0F766E" }
        }
      >
        {icon}
      </div>
      <p className="font-display mt-3 text-3xl font-bold text-foreground tabular-nums">
        {value}
        {suffix && <span className="ml-1.5 font-sans text-sm font-medium text-muted-foreground">{suffix}</span>}
      </p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}



function MasteryBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Not started
      </span>
    );
  }
  const num = Math.round(score);
  if (num >= 80) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        {num}%
      </span>
    );
  }
  if (num >= 40) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        {num}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
      {num}%
    </span>
  );
}
