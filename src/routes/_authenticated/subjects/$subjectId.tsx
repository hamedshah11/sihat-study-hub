import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/brand/StatusChip";
import { useProgress } from "@/lib/progress-data";
import { petalColour } from "@/lib/subject-colours";
import { pageTitle } from "@/lib/brand";
import type { ChapterSnapshot } from "@/lib/progress-snapshot";

export const Route = createFileRoute("/_authenticated/subjects/$subjectId")({
  head: () => ({ meta: [{ title: pageTitle("Subject") }] }),
  component: SubjectDetail,
});

function tabFor(action: ChapterSnapshot["action"]) {
  if (action.kind === "cards") return "flashcards" as const;
  if (action.kind === "quiz") return "quiz" as const;
  return undefined;
}

function BackToSubjects() {
  return (
    <Link
      to="/subjects"
      className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-3 text-[14px] font-medium text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-5" /> Subjects
    </Link>
  );
}

function SubjectDetail() {
  const { subjectId } = Route.useParams();
  const { data: progress, isLoading } = useProgress();
  const subject = progress?.subjects.find((s) => s.id === subjectId);

  // Subjects outside the current semester aren't in the progress snapshot;
  // list their chapters plainly so they're still easy to revise.
  const { data: other, isLoading: loadingOther } = useQuery({
    queryKey: ["subject-plain", subjectId],
    enabled: !isLoading && !subject,
    queryFn: async () => {
      const [{ data: s }, { data: chapters }] = await Promise.all([
        supabase.from("subjects").select("id, name, colour").eq("id", subjectId).maybeSingle(),
        supabase
          .from("chapters")
          .select("id, title, display_order")
          .eq("subject_id", subjectId)
          .eq("status", "published")
          .order("display_order", { ascending: true }),
      ]);
      return { subject: s, chapters: chapters ?? [] };
    },
  });

  if (isLoading || (!subject && loadingOther)) {
    return (
      <div className="space-y-3 pt-2">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-12 w-2/3 rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-[20px]" />
        ))}
      </div>
    );
  }

  if (!subject) {
    if (!other?.subject) {
      return (
        <div className="pt-2">
          <BackToSubjects />
          <div className="mt-4 rounded-[22px] border bg-card p-6 text-sm text-muted-foreground">
            This subject isn't available.
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-2xl pb-4 pt-2">
        <BackToSubjects />
        <SubjectTitle name={other.subject.name} colour={other.subject.colour} index={0} />
        <div className="mt-5 space-y-2.5">
          {other.chapters.map((c, i) => (
            <Link
              key={c.id}
              to="/chapters/$chapterId"
              params={{ chapterId: c.id }}
              className="flex min-h-[64px] items-center gap-3 rounded-[20px] border bg-card px-4 py-3"
            >
              <span className="fl-number w-5 shrink-0 text-[13px] text-muted-foreground">
                {c.display_order ?? i + 1}
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold">{c.title}</span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-4 pt-2">
      <BackToSubjects />
      <SubjectTitle name={subject.name} colour={subject.colour} index={subject.index} />
      <div className="mt-2 flex items-center gap-2">
        <StatusChip state={subject.state} />
        {subject.mastery != null && (
          <span className="fl-number text-[14px]">{subject.percent}%</span>
        )}
        <span className="text-[13px] text-muted-foreground">
          · {subject.chaptersStarted} of {subject.chaptersTotal} chapters started
        </span>
      </div>

      <h2 className="mt-6 text-[13px] font-semibold text-muted-foreground">Chapters</h2>
      <div className="mt-2 space-y-2.5">
        {subject.chapters.length === 0 && (
          <div className="rounded-[20px] border bg-card p-5 text-sm text-muted-foreground">
            No chapters are ready yet. Your teachers are reviewing them.
          </div>
        )}
        {subject.chapters.map((c, i) => (
          <Link
            key={c.id}
            to="/chapters/$chapterId"
            params={{ chapterId: c.id }}
            search={{ tab: tabFor(c.action) }}
            className={`animate-fade-up stagger-${Math.min(i + 1, 6)} flex min-h-[72px] items-center gap-3 rounded-[20px] border bg-card px-4 py-3`}
          >
            <span className="fl-number w-5 shrink-0 text-[13px] text-muted-foreground">
              {c.order}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug">{c.title}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusChip state={c.state} />
                <span
                  className={
                    c.action.kind === "none"
                      ? "text-[13px] text-muted-foreground"
                      : "text-[13px] font-semibold text-accent-ink"
                  }
                >
                  {c.action.label}
                </span>
              </span>
            </span>
            <span className="fl-number shrink-0 text-[14px]">
              {c.mastery == null ? "" : `${c.percent}%`}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>

      {subject.chapters.some((c) => c.quizAvailable) && (
        <Link
          to="/subjects/$subjectId/exam"
          params={{ subjectId }}
          search={{}}
          className="mt-6 flex min-h-[60px] items-center gap-3 rounded-[20px] border border-dashed border-border-strong px-4 py-3"
        >
          <Clock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Practice exam</span>
            <span className="block text-[13px] text-muted-foreground">
              Timed questions from every chapter, like the real paper.
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function SubjectTitle({
  name,
  colour,
  index,
}: {
  name: string;
  colour: string | null;
  index: number;
}) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span
        aria-hidden
        className="h-9 w-1.5 rounded-full"
        style={{ backgroundColor: petalColour(colour, index) }}
      />
      <h1 className="font-display text-[28px] leading-tight md:text-[34px]">{name}</h1>
    </div>
  );
}
