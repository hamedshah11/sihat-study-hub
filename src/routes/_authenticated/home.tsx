import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { ProgressRose } from "@/components/brand/ProgressRose";
import { InstallPrompt } from "@/components/InstallPrompt";
import { DaysInRow } from "@/components/DaysInRow";
import { useProgress } from "@/lib/progress-data";
import { useMistakes } from "@/lib/mistakes-data";
import { isLamplightHour } from "@/lib/theme";
import { pageTitle } from "@/lib/brand";
import type { ProgressPayload } from "@/lib/progress.functions";
import { INTRO_SEEN_KEY } from "./intro";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: pageTitle("Today") }] }),
  component: TodayPage,
});

function greeting(firstDay: boolean, name: string) {
  if (firstDay) return `Welcome, ${name}.`;
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return `Good morning, ${name}.`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${name}.`;
  return `Good evening, ${name}.`;
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Shorter subject names for one-line summaries ("Microbiology and Anatomy"). */
function shortSubject(name: string) {
  return name
    .replace(/\s+I{1,3}$/u, "")
    .replace(/^Anatomy and Physiology$/i, "Anatomy")
    .replace(/^Fundamentals of Nursing$/i, "Fundamentals");
}

export function SessionCard({ data }: { data: ProgressPayload }) {
  const { plan, firstDay } = data;
  const evening = isLamplightHour();
  const label = firstDay ? "Your first review" : evening ? "Tonight's lamp" : "Today's review";
  const hasReview = plan.cardsDue > 0;
  const hasNew = !hasReview && plan.newCards !== null;
  const hasQuiz = plan.quizChapterId !== null;

  if (!hasReview && !hasNew && !hasQuiz) {
    const noContent = data.subjects.every((s) => s.chaptersTotal === 0);
    return (
      <section className="animate-fade-up stagger-1 rounded-[24px] border bg-card p-5">
        <p className="text-[12.5px] font-semibold text-muted-foreground">{label}</p>
        {noContent ? (
          <>
            <h2 className="mt-2 font-display text-[24px] leading-tight">No chapters yet.</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your teachers are reviewing the first chapters. They'll appear here as soon as
              they're approved.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-2 font-display text-[24px] leading-tight">Done for today.</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Tomorrow's cards will be ready in the morning.
            </p>
            <Link
              to="/subjects"
              className="mt-4 inline-flex h-11 items-center gap-1 rounded-full border border-border-strong px-5 text-sm font-semibold"
            >
              Browse subjects <ChevronRight className="size-4" />
            </Link>
          </>
        )}
      </section>
    );
  }

  let headline: string;
  let detail: string;
  if (hasReview) {
    headline = `${plan.cardsDue} card${plan.cardsDue === 1 ? "" : "s"}${hasQuiz ? " · 1 quiz" : ""}`;
    const subjects = joinNames(plan.dueSubjects.slice(0, 2).map((s) => shortSubject(s.name)));
    const tonight = evening && plan.dueSubjects.length === 1 ? " These cards are due today, so tonight is the best time to review them." : "";
    detail = `About ${plan.minutes} minutes. ${subjects}.${tonight}`;
  } else if (hasNew) {
    const n = plan.newCards!;
    headline = `${n.count} card${n.count === 1 ? "" : "s"} · ${n.subjectName}`;
    detail = `About ${plan.minutes} minutes. Chapter ${n.order}, ${n.title}.`;
  } else {
    headline = "1 quiz";
    detail = `About ${plan.minutes} minutes. Five questions, each with a short explanation.`;
  }

  return (
    <section className="animate-fade-up stagger-1 rounded-[24px] bg-lamp p-5 text-night">
      <p className="text-[12.5px] font-bold uppercase tracking-[0.06em]">{label}</p>
      <h2 className="mt-2 font-display text-[26px] leading-[1.1]">{headline}</h2>
      <p className="mt-1.5 text-[14px] leading-snug text-night/80">{detail}</p>
      <Link
        to="/session"
        className="mt-4 flex h-[52px] w-full items-center justify-center rounded-full bg-night text-[15px] font-semibold text-linen"
      >
        Start review
      </Link>
    </section>
  );
}

function ProgressSummary({ data }: { data: ProgressPayload }) {
  const counts = { in_bloom: 0, growing: 0, needs_light: 0 };
  for (const s of data.subjects) {
    if (s.state in counts) counts[s.state as keyof typeof counts] += 1;
  }
  const parts = [
    counts.in_bloom && `${counts.in_bloom} in bloom`,
    counts.growing && `${counts.growing} growing`,
    counts.needs_light && `${counts.needs_light} needs light`,
  ].filter(Boolean);
  return (
    <Link
      to="/progress"
      className="animate-fade-up stagger-2 flex items-center gap-4 rounded-[22px] border bg-card p-4"
    >
      <ProgressRose petals={data.subjects} size={64} title="Your progress rose" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Progress</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
          {data.chaptersStarted === 0
            ? "Not started yet. Your first review starts your first petal."
            : parts.join(" · ") || "Started. Keep going to grow your petals."}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function TodayPage() {
  const { data, isLoading, error, refetch } = useProgress();
  const { data: mistakes } = useMistakes();
  const dueMistakes = mistakes?.due.length ?? 0;
  const navigate = useNavigate();

  // A brand-new student meets the rose once, before their first review.
  useEffect(() => {
    if (!data?.firstDay) return;
    try {
      if (!localStorage.getItem(INTRO_SEEN_KEY)) navigate({ to: "/intro" });
    } catch {
      // No storage: skip the introduction rather than loop.
    }
  }, [data?.firstDay, navigate]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        <Skeleton className="h-[200px] rounded-[24px]" />
        <Skeleton className="h-[96px] rounded-[22px]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <TopBar />
        <div className="rounded-[22px] border bg-card p-5">
          <h1 className="font-display text-[24px]">Today didn't load.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check your connection and try again. Your progress is safe.
          </p>
          <button
            onClick={() => void refetch()}
            className="mt-4 h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      <TopBar initial={data.student.initial} />
      <h1 className="animate-fade-up pt-1 font-display text-[30px] leading-[1.1] text-foreground md:text-[36px]">
        {greeting(data.firstDay, data.student.firstName)}
      </h1>

      <SessionCard data={data} />

      {dueMistakes > 0 && (
        <Link
          to="/review"
          className="animate-fade-up stagger-2 flex items-center gap-3 rounded-[20px] border bg-card px-4 py-3"
        >
          <RotateCcw className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-[14px]">
            <span className="font-semibold">
              {dueMistakes} question{dueMistakes === 1 ? "" : "s"} to revisit
            </span>
            <span className="text-muted-foreground"> · about {Math.max(2, dueMistakes)} min</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <ProgressSummary data={data} />

      {!data.firstDay && <DaysInRow week={data.week} count={data.daysInRow} />}

      {!data.student.batchId && (
        <Link
          to="/profile"
          className="animate-fade-up stagger-3 flex items-center gap-3 rounded-[20px] border border-dashed border-border-strong px-4 py-3 text-[14px]"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Join your batch</span>
            <span className="block text-[13px] text-muted-foreground">
              Enter the batch code from your class coordinator to see your own course.
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* Offer installing only after the first useful session. */}
      {!data.firstDay && <InstallPrompt />}
    </div>
  );
}
