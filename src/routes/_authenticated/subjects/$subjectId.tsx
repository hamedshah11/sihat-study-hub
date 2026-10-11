import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { OfflineChip, StatusChip } from "@/components/brand/StatusChip";
import { SubjectDownload } from "@/components/DownloadForOffline";
import { NeedsInternet, useOnline } from "@/components/OfflineBanner";
import { useDownloads } from "@/lib/downloads";
import type { DownloadedChapterMeta } from "@/lib/offline-store";
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
  const online = useOnline();
  const { data: progress, isLoading, isError } = useProgress();
  const { data: downloads } = useDownloads();
  const subject = progress?.subjects.find((s) => s.id === subjectId);
  const saved = (downloads?.chapters ?? []).filter((c) => c.subject?.id === subjectId);
  const isSaved = (chapterId: string) => saved.some((c) => c.chapterId === chapterId);

  // Subjects outside the current semester aren't in the progress snapshot;
  // list their chapters plainly so they're still easy to revise.
  const {
    data: other,
    isLoading: loadingOther,
    isError: otherFailed,
  } = useQuery({
    queryKey: ["subject-plain", subjectId],
    enabled: Boolean(progress) && !subject,
    queryFn: async () => {
      const [subjectResult, chaptersResult] = await Promise.all([
        supabase.from("subjects").select("id, name, colour").eq("id", subjectId).maybeSingle(),
        supabase
          .from("chapters")
          .select("id, title, display_order")
          .eq("subject_id", subjectId)
          .eq("status", "published")
          .order("display_order", { ascending: true }),
      ]);
      if (subjectResult.error) throw new Error(subjectResult.error.message);
      if (chaptersResult.error) throw new Error(chaptersResult.error.message);
      return { subject: subjectResult.data, chapters: chaptersResult.data ?? [] };
    },
  });

  // No signal (or the server didn't answer): show what's downloaded.
  if ((!progress && (!online || isError)) || (!subject && otherFailed)) {
    return <DownloadedSubject chapters={saved} loading={!downloads} />;
  }

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
        <SubjectDownload
          subject={other.subject}
          chapterIds={other.chapters.map((c) => c.id)}
          className="mt-4"
        />
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
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{c.title}</span>
                {isSaved(c.id) && <OfflineChip className="mt-1.5" />}
              </span>
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
          <span className="text-[14px] font-medium tabular-nums">{subject.percent}%</span>
        )}
      </div>
      <SubjectDownload
        subject={{ id: subject.id, name: subject.name, colour: subject.colour }}
        chapterIds={subject.chapters.map((c) => c.id)}
        className="mt-4"
      />

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
                {isSaved(c.id) && <OfflineChip />}
              </span>
            </span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums">
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

/** With no signal: the subject's downloaded chapters, or a plain note that there are none. */
function DownloadedSubject({
  chapters,
  loading,
}: {
  chapters: DownloadedChapterMeta[];
  loading: boolean;
}) {
  if (loading) return null;
  const subject = chapters[0]?.subject;
  if (!subject) {
    return (
      <div className="pt-2">
        <BackToSubjects />
        <NeedsInternet title="This subject isn't downloaded." className="mt-4">
          <p className="mt-1 text-sm text-muted-foreground">
            Connect to the internet to open it. Download for offline keeps its chapters on this
            phone for next time.
          </p>
        </NeedsInternet>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl pb-4 pt-2">
      <BackToSubjects />
      <SubjectTitle name={subject.name} colour={subject.colour} index={0} />
      <p className="mt-2 text-[14px] text-muted-foreground">
        You're offline. These chapters are downloaded to this phone.
      </p>
      <div className="mt-5 space-y-2.5">
        {chapters.map((c, i) => (
          <Link
            key={c.chapterId}
            to="/chapters/$chapterId"
            params={{ chapterId: c.chapterId }}
            className="flex min-h-[64px] items-center gap-3 rounded-[20px] border bg-card px-4 py-3"
          >
            <span className="fl-number w-5 shrink-0 text-[13px] text-muted-foreground">
              {c.displayOrder ?? i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{c.title}</span>
              <OfflineChip className="mt-1.5" />
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
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
