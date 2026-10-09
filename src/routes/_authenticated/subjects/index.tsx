import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { StatusChip } from "@/components/brand/StatusChip";
import { useProgress } from "@/lib/progress-data";
import { petalColour } from "@/lib/subject-colours";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/subjects/")({
  head: () => ({ meta: [{ title: pageTitle("Subjects") }] }),
  component: SubjectsList,
});

/** One row per subject: petal colour, state, what's due today, and mastery. */
function SubjectsList() {
  const { data, isLoading } = useProgress();

  return (
    <div className="mx-auto max-w-2xl pb-4">
      <TopBar initial={data?.student.initial} />
      <header className="animate-fade-up flex items-end justify-between gap-3 pt-1">
        <h1 className="font-display text-[30px] leading-tight md:text-[36px]">Subjects</h1>
        <p className="pb-1.5 text-[13px] font-medium text-muted-foreground">
          {data?.student.semesterName ?? (data ? "Semester 1" : "")}
        </p>
      </header>
      {data?.student.batchName && (
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {data.student.college} · {data.student.programmeName ?? data.student.batchName}
        </p>
      )}

      <div className="mt-5 space-y-2.5">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-[20px]" />)}

        {data && data.subjects.length === 0 && (
          <div className="rounded-[22px] border bg-card p-6 text-center">
            <h2 className="font-display text-[22px]">No subjects yet.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your course will appear here once your teachers approve its first chapters.
            </p>
          </div>
        )}

        {data?.subjects.map((subject, i) => (
          <Link
            key={subject.id}
            to="/subjects/$subjectId"
            params={{ subjectId: subject.id }}
            className={`animate-fade-up stagger-${Math.min(i + 1, 6)} flex min-h-[76px] items-center gap-3 rounded-[20px] border bg-card py-3 pl-3 pr-3`}
          >
            <span
              aria-hidden
              className="h-11 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: petalColour(subject.colour, subject.index) }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{subject.name}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusChip state={subject.state} />
                <span className="text-[13px] font-semibold text-accent-ink">
                  {subject.cardsDue > 0 ? `${subject.cardsDue} due` : ""}
                </span>
                {subject.cardsDue === 0 && (
                  <span className="text-[13px] text-muted-foreground">
                    {subject.chaptersTotal === 0
                      ? "Chapters coming soon"
                      : subject.chaptersStarted === 0
                        ? `${subject.chaptersTotal} chapter${subject.chaptersTotal === 1 ? "" : "s"}`
                        : "Nothing due"}
                  </span>
                )}
              </span>
            </span>
            <span className="fl-number shrink-0 text-[15px] text-foreground">
              {subject.mastery == null ? "" : `${subject.percent}%`}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>

      {data && data.earlierSubjects.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-semibold text-muted-foreground">Earlier semesters</h2>
          <div className="mt-2 divide-y overflow-hidden rounded-[20px] border bg-card">
            {data.earlierSubjects.map((subject, i) => (
              <Link
                key={subject.id}
                to="/subjects/$subjectId"
                params={{ subjectId: subject.id }}
                className="flex min-h-[56px] items-center gap-3 px-4 py-2.5"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: petalColour(subject.colour, i) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{subject.name}</span>
                  <span className="block text-[12.5px] text-muted-foreground">{subject.semesterName}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
