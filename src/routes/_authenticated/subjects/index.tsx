import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { subjectColourVariables } from "@/lib/subject-colours";
import * as Icons from "lucide-react";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/subjects/")({
  head: () => ({ meta: [{ title: "Subjects — Sihat" }] }),
  component: SubjectsList,
});

type Filter = "all" | "progress" | "new";

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
  return <Icon className="size-[22px]" />;
}

function SubjectsList() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["subjects-list"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { semesterName: null, subjects: [] };

      const { data: profile } = await supabase
        .from("profiles")
        .select("batch_id")
        .eq("id", user.id)
        .maybeSingle();
      let currentSemesterNumber: number | null = null;
      let semesterName: string | null = null;
      if (profile?.batch_id) {
        const { data: batch } = await supabase
          .from("batches")
          .select("current_semester_id")
          .eq("id", profile.batch_id)
          .maybeSingle();
        if (batch?.current_semester_id) {
          const { data: semester } = await supabase
            .from("semesters")
            .select("name, number")
            .eq("id", batch.current_semester_id)
            .maybeSingle();
          currentSemesterNumber = semester?.number ?? null;
          semesterName = semester?.name ?? null;
        }
      }

      const [{ data: semesters }, { data: subjects }, { data: chapters }] = await Promise.all([
        supabase.from("semesters").select("id, number"),
        supabase.from("subjects").select("id, name, icon, colour, display_order, semester_id"),
        supabase.from("chapters").select("id, subject_id").eq("status", "published"),
      ]);
      const semesterNumbers = new Map(
        (semesters ?? []).map((semester) => [semester.id, semester.number]),
      );
      const allowedSemesterIds =
        currentSemesterNumber == null
          ? null
          : new Set(
              (semesters ?? [])
                .filter((semester) => semester.number <= currentSemesterNumber)
                .map((semester) => semester.id),
            );
      const visibleSubjects = (subjects ?? []).filter(
        (subject) =>
          !allowedSemesterIds ||
          (subject.semester_id && allowedSemesterIds.has(subject.semester_id)),
      );
      const chapterIds = (chapters ?? []).map((chapter) => chapter.id);
      const { data: progress } = chapterIds.length
        ? await supabase
            .from("chapter_progress")
            .select("chapter_id, completed_at")
            .eq("user_id", user.id)
            .in("chapter_id", chapterIds)
        : { data: [] };
      const completed = new Set(
        (progress ?? []).filter((item) => item.completed_at).map((item) => item.chapter_id),
      );

      return {
        semesterName: semesterName ?? "All semesters",
        subjects: visibleSubjects
          .map((subject) => {
            const subjectChapters = (chapters ?? []).filter(
              (chapter) => chapter.subject_id === subject.id,
            );
            const done = subjectChapters.filter((chapter) => completed.has(chapter.id)).length;
            return {
              ...subject,
              chapterCount: subjectChapters.length,
              done,
              semesterNumber: subject.semester_id
                ? (semesterNumbers.get(subject.semester_id) ?? 99)
                : 99,
            };
          })
          .sort(
            (a, b) =>
              a.semesterNumber - b.semesterNumber ||
              (a.display_order ?? 0) - (b.display_order ?? 0),
          ),
      };
    },
  });

  const subjects = (data?.subjects ?? []).filter(
    (subject) =>
      filter === "all" || (filter === "progress" ? subject.done > 0 : subject.done === 0),
  );

  return (
    <div className="mx-auto max-w-3xl pb-4">
      <header className="animate-fade-up">
        <p className="text-sm text-muted-foreground">{data?.semesterName ?? "…"}</p>
        <h1 className="font-display text-[40px] leading-none text-foreground">Subjects</h1>
      </header>

      <div
        className="animate-fade-up stagger-1 mt-7 flex gap-2 overflow-x-auto pb-1"
        aria-label="Filter subjects"
      >
        {(
          [
            ["all", "All"],
            ["progress", "In progress"],
            ["new", "Not started"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`h-11 shrink-0 rounded-full border px-5 text-sm font-semibold ${filter === value ? "border-foreground bg-foreground text-background" : "bg-card text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-7 space-y-3">
        {isLoading &&
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-[20px]" />
          ))}
        {!isLoading && subjects.length === 0 && (
          <div className="rounded-[20px] border bg-card p-8 text-center text-sm text-muted-foreground">
            No subjects match this filter.
          </div>
        )}
        {subjects.map((subject, index) => {
          const percentage = subject.chapterCount
            ? Math.round((subject.done / subject.chapterCount) * 100)
            : 0;
          return (
            <Link
              key={subject.id}
              to="/subjects/$subjectId"
              params={{ subjectId: subject.id }}
              style={subjectColourVariables(subject.colour)}
              className={`subject-colour card-lift animate-fade-up stagger-${Math.min(index + 1, 6)} flex items-center gap-3 rounded-[20px] border bg-card px-3.5 py-3`}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-subject text-white">
                <SubjectIcon name={subject.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-foreground">{subject.name}</span>
                  {percentage === 0 ? (
                    <span className="rounded-full bg-subject-tint px-2.5 py-1 text-xs font-bold text-subject-ink">
                      New
                    </span>
                  ) : (
                    <span className="text-sm font-bold text-subject-ink">{percentage}%</span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {subject.chapterCount} chapter{subject.chapterCount === 1 ? "" : "s"}
                  {subject.done > 0 && ` · ${subject.done} done`}
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-subject-tint">
                  <span
                    className="animate-bar-fill block h-full rounded-full bg-subject"
                    style={{ width: `${percentage}%` }}
                  />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
