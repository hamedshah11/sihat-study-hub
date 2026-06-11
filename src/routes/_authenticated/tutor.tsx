import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Send, AlertCircle, RefreshCw, CheckCircle2, CircleAlert, XCircle, BookOpen } from "lucide-react";
import { recordStudyActivity } from "@/lib/study-activity";
import { awardBadgesIfNeeded } from "@/lib/award-badges";

export const Route = createFileRoute("/_authenticated/tutor")({
  head: () => ({ meta: [{ title: "Tutor — Sihat" }] }),
  component: TutorPracticePage,
});

type Verdict = "strong" | "partial" | "weak";
type GradeResult = { verdict: Verdict; correct: string[]; missed: string[]; modelAnswer: string };

type ChapterOpt = { id: string; title: string; subjectName: string | null };

function TutorPracticePage() {
  const [chapterId, setChapterId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [loadingQ, setLoadingQ] = useState(false);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recentRef = useRef<string[]>([]);

  const { data: chapters, isLoading: chaptersLoading } = useQuery({
    queryKey: ["tutor-practice-chapters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chapters")
        .select("id, title, summary_md, subject_id, subjects(name)")
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((c: any) => (c.summary_md ?? "").trim().length > 0)
        .map((c: any) => ({
          id: c.id,
          title: c.title,
          subjectName: c.subjects?.name ?? null,
        })) as ChapterOpt[];
    },
  });

  // Auto-pick first chapter when list loads
  useEffect(() => {
    if (!chapterId && chapters && chapters.length > 0) {
      setChapterId(chapters[0].id);
    }
  }, [chapters, chapterId]);

  const currentChapter = useMemo(
    () => chapters?.find((c) => c.id === chapterId) ?? null,
    [chapters, chapterId]
  );

  async function fetchNext() {
    if (!chapterId) return;
    setError(null);
    setResult(null);
    setAnswer("");
    setLoadingQ(true);
    try {
      const { data, error } = await supabase.functions.invoke("tutor-practice", {
        body: { action: "next", chapterId, recentQuestions: recentRef.current.slice(-5) },
      });
      if (error) {
        const ctx = (error as any).context;
        let msg = error.message || "Could not load a question.";
        try {
          const body = await ctx?.json?.();
          if (body?.error) msg = body.error;
        } catch {}
        setError(msg);
        return;
      }
      const q = String(data?.question ?? "").trim();
      if (!q) {
        setError("Tutor did not return a question. Please try again.");
        return;
      }
      setQuestion(q);
      recentRef.current = [...recentRef.current, q].slice(-5);
    } catch (e: any) {
      setError(e?.message || "Network error.");
    } finally {
      setLoadingQ(false);
    }
  }

  async function gradeAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterId || !question || !answer.trim() || grading) return;
    setError(null);
    setGrading(true);
    try {
      const { data, error } = await supabase.functions.invoke("tutor-practice", {
        body: { action: "grade", chapterId, question, answer: answer.trim() },
      });
      if (error) {
        const ctx = (error as any).context;
        let msg = error.message || "Could not grade your answer.";
        try {
          const body = await ctx?.json?.();
          if (body?.error) msg = body.error;
        } catch {}
        setError(msg);
        return;
      }
      setResult(data as GradeResult);
      await recordStudyActivity("tutor");
      await awardBadgesIfNeeded();
    } catch (e: any) {
      setError(e?.message || "Network error.");
    } finally {
      setGrading(false);
    }
  }

  // Reset when chapter changes
  useEffect(() => {
    setQuestion("");
    setAnswer("");
    setResult(null);
    setError(null);
    recentRef.current = [];
  }, [chapterId]);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="animate-fade-up flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-primary text-primary-foreground shadow-glow">
            <Sparkles className="size-5" />
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-primary">AI Tutor</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Practice viva-style. Pick a chapter, answer in your own words, get instant feedback.
        </p>
      </header>

      {/* Chapter picker */}
      <div className="animate-fade-up stagger-1 rounded-2xl bg-card border border-border p-4 flex flex-col gap-2 shadow-soft">
        <label htmlFor="chapter" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Chapter
        </label>
        {chaptersLoading ? (
          <Skeleton className="h-11 rounded-lg" />
        ) : !chapters || chapters.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <BookOpen className="size-4" /> No chapters with notes yet.
          </p>
        ) : (
          <select
            id="chapter"
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            className="w-full min-h-11 rounded-lg bg-surface border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subjectName ? `${c.subjectName} — ${c.title}` : c.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Question card */}
      <div className="animate-fade-up stagger-2 rounded-2xl bg-card border border-border p-4 flex flex-col gap-3 shadow-soft">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Sparkles className="size-4 text-primary" /> Question
          </div>
          <button
            type="button"
            onClick={fetchNext}
            disabled={!chapterId || loadingQ || grading}
            className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-3 min-h-9 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loadingQ ? "animate-spin" : ""}`} />
            {question ? "New question" : "Get question"}
          </button>
        </div>

        {loadingQ ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : question ? (
          <p className="text-base leading-relaxed">{question}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {currentChapter
              ? `Tap "Get question" to start practising "${currentChapter.title}".`
              : "Pick a chapter first."}
          </p>
        )}
      </div>

      {/* Answer form */}
      {question && (
        <form onSubmit={gradeAnswer} className="animate-fade-up rounded-2xl bg-card border border-border p-4 flex flex-col gap-3 shadow-soft">
          <label htmlFor="answer" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Your answer
          </label>
          <textarea
            id="answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Explain in your own words…"
            rows={5}
            maxLength={2000}
            disabled={grading || !!result}
            className="w-full rounded-lg bg-surface border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-70 resize-y min-h-[120px]"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{answer.length}/2000</span>
            <button
              type="submit"
              disabled={grading || !answer.trim() || !!result}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 min-h-11 text-sm font-medium disabled:opacity-50"
            >
              <Send className="size-4" />
              {grading ? "Grading…" : "Submit answer"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-sm">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="animate-scale-in rounded-2xl bg-card border border-border p-4 flex flex-col gap-4 shadow-soft">
          <VerdictBadge verdict={result.verdict} />

          {result.correct.length > 0 && (
            <Section
              icon={<CheckCircle2 className="size-4 text-emerald-600" />}
              title="What you got right"
              items={result.correct}
              tone="positive"
            />
          )}

          {result.missed.length > 0 && (
            <Section
              icon={<CircleAlert className="size-4 text-amber-600" />}
              title="What was missing"
              items={result.missed}
              tone="warning"
            />
          )}

          {result.modelAnswer && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Model answer
              </div>
              <p className="text-sm leading-relaxed bg-surface rounded-lg p-3">{result.modelAnswer}</p>
            </div>
          )}

          <button
            type="button"
            onClick={fetchNext}
            disabled={loadingQ}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground min-h-11 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loadingQ ? "animate-spin" : ""}`} />
            Next question
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Answers are graded only from this chapter's notes. Verify clinical details with your instructor.
      </p>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const map = {
    strong: {
      label: "Strong answer",
      icon: <CheckCircle2 className="size-4" />,
      cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    partial: {
      label: "On the right track",
      icon: <CircleAlert className="size-4" />,
      cls: "bg-amber-100 text-amber-800 border-amber-200",
    },
    weak: {
      label: "Needs more work",
      icon: <XCircle className="size-4" />,
      cls: "bg-rose-100 text-rose-800 border-rose-200",
    },
  } as const;
  const v = map[verdict];
  return (
    <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-sm font-medium ${v.cls}`}>
      {v.icon}
      {v.label}
    </div>
  );
}

function Section({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone: "positive" | "warning";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {icon} {title}
      </div>
      <ul className="flex flex-col gap-1 text-sm pl-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted-foreground">•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
