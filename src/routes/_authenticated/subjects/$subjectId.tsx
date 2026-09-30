import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { subjectColourVariables } from "@/lib/subject-colours";
import { useMistakes } from "@/lib/mistakes-data";

export const Route = createFileRoute("/_authenticated/subjects/$subjectId")({
  head: () => ({ meta: [{ title: "Subject — Sihat" }] }),
  component: SubjectDetail,
});

function SubjectDetail() {
  const { subjectId } = Route.useParams();
  const { data: mistakes } = useMistakes();
  const mistakesByChapter = new Map<string, number>();
  for (const m of mistakes?.due ?? []) {
    if (m.chapterId) {
      mistakesByChapter.set(m.chapterId, (mistakesByChapter.get(m.chapterId) ?? 0) + 1);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["subject-detail", subjectId],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [{ data: subject }, { data: chapters }] = await Promise.all([
        supabase
          .from("subjects")
          .select("id, name, colour, semester_id, semesters(name)")
          .eq("id", subjectId)
          .maybeSingle(),
        supabase
          .from("chapters")
          .select("id, title, display_order, status")
          .eq("subject_id", subjectId)
          .eq("status", "published")
          .order("display_order", { ascending: true }),
      ]);

      let progressMap = new Map<string, { score: number | null; completed: boolean }>();
      if (user && chapters && chapters.length > 0) {
        const { data: progress } = await supabase
          .from("chapter_progress")
          .select("chapter_id, mastery_score, completed_at")
          .eq("user_id", user.id)
          .in(
            "chapter_id",
            chapters.map((c) => c.id),
          );
        progressMap = new Map(
          (progress ?? []).map((p) => [
            p.chapter_id,
            {
              score: p.mastery_score == null ? null : Number(p.mastery_score),
              completed: Boolean(p.completed_at),
            },
          ]),
        );
      }

      // Flashcards due now, per chapter (cards the student has started).
      const dueCards = new Map<string, number>();
      if (user && chapters && chapters.length > 0) {
        const { data: due } = await supabase
          .from("flashcard_reviews")
          .select("flashcard_id, flashcards!inner(chapter_id, status)")
          .eq("user_id", user.id)
          .lte("due_at", new Date().toISOString())
          .eq("flashcards.status", "approved")
          .in(
            "flashcards.chapter_id",
            chapters.map((c) => c.id),
          );
        for (const r of (due ?? []) as unknown as { flashcards: { chapter_id: string } }[]) {
          const id = r.flashcards?.chapter_id;
          if (id) dueCards.set(id, (dueCards.get(id) ?? 0) + 1);
        }
      }

      return { subject, chapters: chapters ?? [], progressMap, dueCards };
    },
  });

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  if (!data?.subject) {
    return (
      <div>
        <Link
          to="/subjects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Subjects
        </Link>
        <div className="mt-6 rounded-xl bg-surface p-6 text-sm text-muted-foreground">
          Subject not found.
        </div>
      </div>
    );
  }

  const completedCount = data.chapters.filter(
    (chapter) => data.progressMap.get(chapter.id)?.completed,
  ).length;
  const percentage = data.chapters.length
    ? Math.round((completedCount / data.chapters.length) * 100)
    : 0;
  const currentIndex = data.chapters.findIndex(
    (chapter) => !data.progressMap.get(chapter.id)?.completed,
  );
  const semester = Array.isArray(data.subject.semesters)
    ? data.subject.semesters[0]?.name
    : data.subject.semesters?.name;

  return (
    <div
      className="subject-colour -mx-4 -mt-6 md:mx-0 md:mt-0"
      style={subjectColourVariables(data.subject.colour)}
    >
      <header className="animate-fade-up relative isolate overflow-hidden rounded-b-[34px] bg-subject px-5 pb-7 pt-8 text-white md:rounded-[30px]">
        <span
          aria-hidden
          className="absolute -right-16 -top-20 -z-10 size-52 rounded-full bg-white/15"
        />
        <span
          aria-hidden
          className="absolute right-10 top-20 -z-10 size-24 rounded-full bg-white/15"
        />
        <span
          aria-hidden
          className="absolute -bottom-24 -left-10 -z-10 size-48 rounded-full bg-subject-deep/40"
        />
        <Link
          to="/subjects"
          aria-label="Back to subjects"
          className="grid size-11 place-items-center rounded-[14px] bg-white/15 text-white hover:bg-white/25"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-white/80">
          {semester ?? "Subject"}
        </p>
        <h1 className="mt-2 max-w-[320px] font-display text-[40px] leading-[1.02]">
          {data.subject.name}
        </h1>
        <div className="mt-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative grid size-[72px] place-items-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 72 72" aria-hidden="true">
                <circle
                  cx="36"
                  cy="36"
                  r="29"
                  fill="none"
                  stroke="rgba(255,255,255,.2)"
                  strokeWidth="7"
                />
                <circle
                  className="animate-ring-draw"
                  cx="36"
                  cy="36"
                  r="29"
                  fill="none"
                  stroke="white"
                  strokeLinecap="round"
                  strokeWidth="7"
                  strokeDasharray="182"
                  strokeDashoffset={182 - (182 * percentage) / 100}
                  style={{ "--ring-length": 182 } as React.CSSProperties}
                />
              </svg>
              <span className="text-lg font-bold tabular-nums">{percentage}%</span>
            </div>
            <p className="text-sm leading-5">
              <strong className="text-lg tabular-nums">
                {completedCount} of {data.chapters.length}
              </strong>
              <br />
              chapters done
            </p>
          </div>
          {data.chapters.length > 0 && (
            <Link
              to="/subjects/$subjectId/exam"
              params={{ subjectId }}
              search={{}}
              className="flex min-h-14 max-w-[155px] items-center gap-2 rounded-[18px] bg-white px-4 font-bold text-subject-ink"
            >
              <Clock className="size-5 shrink-0" /> Practice exam
            </Link>
          )}
        </div>
      </header>

      <section className="px-4 pt-7 md:px-0">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold text-foreground">Chapters</h2>
          <span className="text-sm text-muted-foreground">
            {data.chapters.length} in this subject
          </span>
        </div>
        <div className="mt-3 space-y-2.5">
          {data.chapters.length === 0 && (
            <div className="rounded-[20px] border bg-card p-6 text-sm text-muted-foreground">
              No chapters published yet.
            </div>
          )}
          {data.chapters.map((chapter, index) => {
            const progress = data.progressMap.get(chapter.id);
            const done = Boolean(progress?.completed);
            const current = index === currentIndex;
            const cards = data.dueCards.get(chapter.id) ?? 0;
            const errors = mistakesByChapter.get(chapter.id) ?? 0;
            return (
              <Link
                key={chapter.id}
                to="/chapters/$chapterId"
                params={{ chapterId: chapter.id }}
                className={`animate-fade-up stagger-${Math.min(index + 1, 6)} flex min-h-[88px] items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 ${current ? "border-2 border-subject shadow-[0_10px_30px_color-mix(in_srgb,var(--subject)_16%,transparent)]" : "border"}`}
              >
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-full font-bold ${done ? "bg-success-bg text-success-ink" : current ? "bg-subject text-white" : "bg-subject-tint text-subject-ink"}`}
                >
                  {done ? <Check className="size-5" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold leading-tight text-foreground">
                    {chapter.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {done && progress?.score != null
                      ? `Mastery ${Math.round(progress.score)}%`
                      : [
                          cards > 0 && `${cards} card${cards === 1 ? "" : "s"} due`,
                          errors > 0 && `${errors} mistake${errors === 1 ? "" : "s"} to fix`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Not started"}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
