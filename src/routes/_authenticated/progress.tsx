import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { NeedsInternet, useOnline } from "@/components/OfflineBanner";
import { ProgressRose } from "@/components/brand/ProgressRose";
import { StatusChip } from "@/components/brand/StatusChip";
import { RecentExams } from "@/components/exam/RecentExams";
import { useProgress } from "@/lib/progress-data";
import { petalColour } from "@/lib/subject-colours";
import { renderShareCard, shareRose } from "@/lib/share-card";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({ meta: [{ title: pageTitle("Progress") }] }),
  component: ProgressPage,
});

/**
 * The full rose, one row per subject with the exact number, and a line
 * explaining what each petal measures. Private by default and never ranked.
 */
function ProgressPage() {
  const { data, isLoading } = useProgress();
  const online = useOnline();
  const [sharing, setSharing] = useState(false);

  async function share() {
    if (!data || sharing) return;
    setSharing(true);
    try {
      const blob = await renderShareCard({
        firstName: data.student.firstName,
        semesterName: data.student.semesterName,
        subjects: data.subjects,
        daysStudied: data.daysStudied,
      });
      const how = await shareRose(blob);
      if (how === "downloaded")
        toast.success("Your rose card is saved. Share it from your photos.");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("The card didn't save. Try again.");
    } finally {
      setSharing(false);
    }
  }

  if (!online && !data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-4">
        <TopBar />
        <h1 className="pt-1 font-display text-[30px] leading-tight md:text-[36px]">Progress</h1>
        <NeedsInternet title="Your rose needs internet.">
          <p className="mt-1 text-sm text-muted-foreground">
            Progress is worked out on the server from your reviews and quizzes. It loads when you're
            back online.
          </p>
        </NeedsInternet>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-[320px] rounded-[24px]" />
        <Skeleton className="h-64 rounded-[22px]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      <TopBar initial={data.student.initial} />
      <header className="animate-fade-up flex items-end justify-between pt-1">
        <h1 className="font-display text-[30px] leading-tight md:text-[36px]">Progress</h1>
        {data.chaptersStarted > 0 && (
          <button
            onClick={() => void share()}
            disabled={sharing}
            className="min-h-11 px-1 text-[14px] font-semibold text-accent-ink disabled:opacity-60"
          >
            {sharing ? "Preparing…" : "Share"}
          </button>
        )}
      </header>

      <section className="dark animate-fade-up stagger-1 flex min-h-[188px] items-center gap-4 rounded-[24px] bg-night px-5 py-6 text-linen">
        <ProgressRose petals={data.subjects} size={76} className="shrink-0" />
        <p className="text-[15px] leading-relaxed text-linen/90">
          How well you recall each subject's cards and score on its quizzes, across the chapters
          you've covered.
        </p>
      </section>

      <section className="animate-fade-up stagger-2 divide-y divide-border">
        {data.subjects.map((s) => (
          <Link
            key={s.id}
            to="/subjects/$subjectId"
            params={{ subjectId: s.id }}
            className="flex min-h-[62px] items-center gap-3 py-2.5"
            aria-label={`${s.name}, ${s.mastery == null ? "not started" : `${s.percent}%`}`}
          >
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: petalColour(s.colour, s.index) }}
            />
            <span className="min-w-0 flex-1 text-[16px] font-semibold leading-tight">{s.name}</span>
            <StatusChip state={s.state} />
            <span className="w-11 shrink-0 text-right text-[15px] font-semibold tabular-nums">
              {s.mastery == null ? "–" : `${s.percent}%`}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </section>

      <div className="animate-fade-up stagger-4">
        <RecentExams />
      </div>
    </div>
  );
}
