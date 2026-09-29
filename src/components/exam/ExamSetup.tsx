import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  FileText,
  History,
  PlayCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getExamOverview, resumeExam, startExam, type ExamPayload } from "@/lib/exam.functions";
import { EXAM_MIN_QUESTIONS, EXAM_MODES, EXAM_PASS_MARK, type ExamMode } from "@/lib/exam-config";

export function ExamSetup({
  subjectId,
  subjectName,
  onStarted,
  onOpenResult,
}: {
  subjectId: string;
  subjectName: string | null;
  onStarted: (exam: ExamPayload) => void;
  onOpenResult: (attemptId: string) => void;
}) {
  const overviewFn = useServerFn(getExamOverview);
  const startFn = useServerFn(startExam);
  const resumeFn = useServerFn(resumeExam);

  const [mode, setMode] = useState<ExamMode>("full");
  // null = every chapter (the default); otherwise the ticked subset.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["exam-overview", subjectId],
    queryFn: () => overviewFn({ data: { subjectId } }),
  });

  const usable = useMemo(() => (data?.chapters ?? []).filter((c) => c.questionCount > 0), [data]);
  const selectedIds = picked ?? new Set(usable.map((c) => c.id));
  const pool = usable.filter((c) => selectedIds.has(c.id)).reduce((n, c) => n + c.questionCount, 0);
  const config = EXAM_MODES[mode];
  const paperSize = Math.min(pool, config.questions);
  const canStart = pool >= EXAM_MIN_QUESTIONS && selectedIds.size > 0;

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next.size === usable.length ? null : next);
  }

  async function begin() {
    setError(null);
    setStarting(true);
    try {
      const exam = await startFn({
        data: {
          subjectId,
          mode,
          chapterIds: picked ? [...picked] : undefined,
        },
      });
      onStarted(exam);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the exam. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  async function resume(attemptId: string) {
    setError(null);
    setStarting(true);
    try {
      onStarted(await resumeFn({ data: { attemptId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resume the exam.");
    } finally {
      setStarting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mt-6 rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-soft">
        Couldn't load exams for this subject. Check your connection and try again.
      </div>
    );
  }

  const minutesLeft = data.active
    ? Math.max(0, Math.ceil((new Date(data.active.expiresAt).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <div className="mt-4 space-y-6">
      <div className="animate-fade-up">
        <p className="caption">Exam mode</p>
        <h1 className="font-display mt-1 text-2xl font-bold text-primary">
          {subjectName ? `${subjectName} exam` : "Subject exam"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Timed MCQs from every chapter. Answers are revealed only after you submit.
        </p>
      </div>

      {data.active && (
        <section className="animate-fade-up rounded-2xl border border-streak/40 bg-streak/10 p-4 shadow-soft">
          <p className="text-sm font-semibold text-foreground">You have an unfinished exam</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {minutesLeft > 0
              ? `${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} left on the clock.`
              : "Time is up. Open it to submit your saved answers."}
          </p>
          <button
            onClick={() => resume(data.active!.id)}
            disabled={starting}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <PlayCircle className="size-4" /> {minutesLeft > 0 ? "Resume exam" : "Open and submit"}
          </button>
        </section>
      )}

      {!data.active && (
        <>
          {/* Length */}
          <section className="animate-fade-up stagger-1 grid grid-cols-2 gap-3">
            {(Object.keys(EXAM_MODES) as ExamMode[]).map((m) => {
              const c = EXAM_MODES[m];
              const active = m === mode;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-2xl border bg-card p-4 text-left shadow-soft transition-all",
                    active ? "border-accent ring-2 ring-accent/30" : "hover:border-accent/40",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{c.label}</span>
                    {active && (
                      <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                  </span>
                  <span className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="size-3.5" /> {c.questions} MCQs
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" /> {c.minutes} min
                    </span>
                  </span>
                  <span className="mt-1.5 block text-xs text-muted-foreground">
                    {c.description}
                  </span>
                </button>
              );
            })}
          </section>

          {/* Chapters */}
          <section className="animate-fade-up stagger-2 rounded-2xl border bg-card shadow-soft">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Chapters</h2>
                <p className="text-xs text-muted-foreground">
                  Untick chapters your exam doesn't cover.
                </p>
              </div>
              {usable.length > 1 && (
                <button
                  className="text-xs font-semibold text-accent"
                  onClick={() => setPicked(picked === null ? new Set() : null)}
                >
                  {picked === null ? "Clear all" : "Select all"}
                </button>
              )}
            </div>
            <ul className="divide-y">
              {data.chapters.map((c, i) => {
                const disabled = c.questionCount === 0;
                const checked = !disabled && selectedIds.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={cn(
                        "flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2.5",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => toggle(c.id)}
                      />
                      <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {c.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {disabled ? "No MCQs yet" : `${c.questionCount} MCQs`}
                      </span>
                    </label>
                  </li>
                );
              })}
              {data.chapters.length === 0 && (
                <li className="px-4 py-6 text-sm text-muted-foreground">
                  No chapters published yet.
                </li>
              )}
            </ul>
          </section>

          {/* Start */}
          <section className="animate-fade-up stagger-3 space-y-2">
            {error && (
              <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {canStart && paperSize < config.questions && (
              <p className="text-xs text-muted-foreground">
                Only {pool} MCQs are available in the chapters you picked, so this paper will have{" "}
                {paperSize} questions.
              </p>
            )}
            {!canStart && usable.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Pick chapters with at least {EXAM_MIN_QUESTIONS} MCQs between them to start.
              </p>
            )}
            <button
              onClick={begin}
              disabled={!canStart || starting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-lifted transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {starting ? "Preparing your paper…" : `Start ${config.label.toLowerCase()}`}
              {!starting && <ArrowRight className="size-4" />}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              {config.minutes} minutes. The timer keeps running if you leave, and the exam submits
              itself when time is up. Pass mark {Math.round(EXAM_PASS_MARK * 100)}%.
            </p>
          </section>
        </>
      )}

      {/* History */}
      {data.history.length > 0 && (
        <section className="animate-fade-up stagger-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-accent/10 text-accent">
              <History className="size-4" />
            </span>
            <h2 className="text-base font-semibold text-foreground">Past exams</h2>
          </div>
          <ScoreTrend history={data.history} />
          <div className="space-y-2">
            {data.history.map((h) => {
              const pct = h.total ? Math.round((h.score / h.total) * 100) : 0;
              const passed = h.total > 0 && h.score / h.total >= EXAM_PASS_MARK;
              return (
                <button
                  key={h.id}
                  onClick={() => onOpenResult(h.id)}
                  className="card-lift flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-soft"
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
                    <span className="block text-sm font-medium text-foreground">
                      {EXAM_MODES[h.mode]?.label ?? "Exam"} · {h.score}/{h.total}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(h.submittedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Small bar trend of the last attempts, oldest on the left. */
function ScoreTrend({ history }: { history: { id: string; score: number; total: number }[] }) {
  const points = history
    .slice(0, 10)
    .reverse()
    .map((h) => ({ id: h.id, pct: h.total ? Math.round((h.score / h.total) * 100) : 0 }));
  if (points.length < 2) return null;
  const first = points[0].pct;
  const last = points[points.length - 1].pct;
  const delta = last - first;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">Last {points.length} attempts</p>
        <p
          className={cn(
            "text-xs font-semibold",
            delta > 0 ? "text-green-700" : delta < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {delta > 0 ? `Up ${delta} points` : delta < 0 ? `Down ${-delta} points` : "No change"}
        </p>
      </div>
      <div className="relative mt-3 flex h-20 items-end gap-1.5">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent/50"
          style={{ bottom: `${EXAM_PASS_MARK * 100}%` }}
          aria-hidden
        />
        {points.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex-1 rounded-t-md",
              p.pct >= EXAM_PASS_MARK * 100 ? "bg-accent" : "bg-primary/25",
            )}
            style={{ height: `${Math.max(4, p.pct)}%` }}
            title={`${p.pct}%`}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Dashed line is the {Math.round(EXAM_PASS_MARK * 100)}% pass mark.
      </p>
    </div>
  );
}
