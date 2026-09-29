import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardCheck, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXAM_MODES, EXAM_PASS_MARK, type ExamMode } from "@/lib/exam-config";
import { formatDate, loadAttempts, pctOf } from "@/lib/exam-history";

/**
 * Recent exams across all subjects, newest first. Each row opens the full
 * review; an unfinished exam gets a Resume row at the top.
 */
export function RecentExams({ limit = 5 }: { limit?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["recent-exams", limit],
    queryFn: () => loadAttempts(undefined, limit + 5),
  });

  if (isLoading || !data || data.length === 0) return null;

  const unfinished = data.filter((r) => !r.submitted_at);
  const done = data.filter((r) => r.submitted_at).slice(0, limit);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-accent/10 text-accent">
          <ClipboardCheck className="size-4" />
        </span>
        <h2 className="text-base font-semibold text-foreground">Exam results</h2>
      </div>
      <div className="space-y-2">
        {unfinished.map((r) => (
          <Link
            key={r.id}
            to="/subjects/$subjectId/exam"
            params={{ subjectId: r.subject_id }}
            search={{}}
            className="card-lift flex items-center gap-3 rounded-2xl border border-streak/40 bg-streak/10 p-3.5 shadow-soft"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-streak/15 text-streak">
              <PlayCircle className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {r.subjects?.name ?? "Exam"}
              </span>
              <span className="block text-xs text-muted-foreground">
                Unfinished {EXAM_MODES[r.mode as ExamMode]?.label.toLowerCase() ?? "exam"}. Tap to
                finish it.
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
        {done.map((r) => {
          const pct = pctOf(r);
          const passed = pct >= EXAM_PASS_MARK * 100;
          return (
            <Link
              key={r.id}
              to="/subjects/$subjectId/exam"
              params={{ subjectId: r.subject_id }}
              search={{ result: r.id }}
              className="card-lift flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-soft"
            >
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums",
                  passed ? "bg-green-100 text-green-800" : "bg-muted text-foreground",
                )}
              >
                {pct}%
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {r.subjects?.name ?? "Exam"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {EXAM_MODES[r.mode as ExamMode]?.label ?? "Exam"} · {r.score ?? 0}/
                  {r.total_questions} · {formatDate(r.submitted_at!)}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
