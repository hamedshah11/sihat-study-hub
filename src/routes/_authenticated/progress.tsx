import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { ProgressRose } from "@/components/brand/ProgressRose";
import { StatusChip } from "@/components/brand/StatusChip";
import { DaysInRow } from "@/components/DaysInRow";
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
      if (how === "downloaded") toast.success("Your rose card is saved. Share it from your photos.");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("The card didn't save. Try again.");
    } finally {
      setSharing(false);
    }
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

      <section className="dark animate-fade-up stagger-1 rounded-[24px] bg-night p-5 text-linen">
        <div className="lamp-glow -m-5 flex flex-col items-center p-5">
          <ProgressRose petals={data.subjects} size={240} interactive glow />
        </div>
        <p className="mt-2 text-center text-[13.5px] leading-snug text-mist">
          Each petal is a subject. A longer petal means you remember more of that subject's cards and do
          better on its quizzes, across the chapters you've started.
        </p>
      </section>

      <section className="animate-fade-up stagger-2 divide-y overflow-hidden rounded-[22px] border bg-card">
        {data.subjects.map((s) => (
          <Link
            key={s.id}
            to="/subjects/$subjectId"
            params={{ subjectId: s.id }}
            className="flex min-h-[64px] items-center gap-3 px-4 py-3"
          >
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-[3px]"
              style={{ backgroundColor: petalColour(s.colour, s.index) }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{s.name}</span>
              <span className="block text-[12.5px] text-muted-foreground">
                {s.chaptersStarted} of {s.chaptersTotal} chapters started
              </span>
            </span>
            <StatusChip state={s.state} className="hidden min-[380px]:inline-flex" />
            <span className="fl-number w-11 shrink-0 text-right text-[14px]">
              {s.mastery == null ? "–" : `${s.percent}%`}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </section>

      <details className="animate-fade-up stagger-3 rounded-[20px] border bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
        <summary className="min-h-8 cursor-pointer list-none font-semibold text-foreground">
          How each petal is measured
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            A subject's number combines how well you'd recall its cards today (60%) with your recent quiz scores
            (40%), across the chapters you've started. Chapters you haven't started don't count against you.
          </p>
          <p>
            Petals can shrink if you stop reviewing, and grow back when you return. "In bloom" needs 80% or more,
            at least two quizzes and two weeks of study in that subject.
          </p>
        </div>
      </details>

      {!data.firstDay && <DaysInRow week={data.week} count={data.daysInRow} />}
      {data.daysStudied > 0 && (
        <p className="text-center text-[13px] text-muted-foreground">
          {data.daysStudied} day{data.daysStudied === 1 ? "" : "s"} studied so far
        </p>
      )}

      <div className="animate-fade-up stagger-4">
        <RecentExams />
      </div>
    </div>
  );
}
