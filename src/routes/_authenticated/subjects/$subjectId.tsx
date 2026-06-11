import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/subjects/$subjectId")({
  head: () => ({ meta: [{ title: "Subject — Sihat" }] }),
  component: SubjectDetail,
});

function masteryBadge(score: number | null) {
  if (score == null) return { label: "Not started", cls: "bg-muted text-muted-foreground" };
  const n = Math.round(score);
  if (n < 40) return { label: `${n}%`, cls: "bg-destructive/10 text-destructive" };
  if (n < 80) return { label: `${n}%`, cls: "bg-yellow-100 text-yellow-800" };
  return { label: `${n}%`, cls: "bg-green-100 text-green-800" };
}

function SubjectDetail() {
  const { subjectId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["subject-detail", subjectId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const [{ data: subject }, { data: chapters }] = await Promise.all([
        supabase.from("subjects").select("id, name, description").eq("id", subjectId).maybeSingle(),
        supabase.from("chapters").select("id, title, display_order, status")
          .eq("subject_id", subjectId).eq("status", "published")
          .order("display_order", { ascending: true }),
      ]);

      let progressMap = new Map<string, number>();
      if (user && chapters && chapters.length > 0) {
        const { data: progress } = await supabase
          .from("chapter_progress").select("chapter_id, mastery_score")
          .eq("user_id", user.id)
          .in("chapter_id", chapters.map(c => c.id));
        progressMap = new Map((progress ?? []).map(p => [p.chapter_id, Number(p.mastery_score)]));
      }

      return { subject, chapters: chapters ?? [], progressMap };
    },
  });

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  if (!data?.subject) {
    return (
      <div>
        <Link to="/subjects" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Subjects
        </Link>
        <div className="mt-6 rounded-xl bg-surface p-6 text-sm text-muted-foreground">
          Subject not found.
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="animate-fade-up">
        <Link
          to="/subjects"
          className="inline-flex items-center gap-1 rounded-full border bg-card py-1.5 pl-2 pr-3.5 text-sm font-medium text-muted-foreground shadow-soft transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Subjects
        </Link>
        <h1 className="font-display mt-4 text-2xl font-bold text-primary">{data.subject.name}</h1>
        {data.subject.description && (
          <p className="mt-1 text-sm text-muted-foreground">{data.subject.description}</p>
        )}
      </header>

      <h2 className="animate-fade-up stagger-1 caption mt-8">Chapters</h2>
      <div className="mt-3 space-y-2.5">
        {data.chapters.length === 0 && (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-soft">
            No chapters published yet.
          </div>
        )}
        {data.chapters.map((c, idx) => {
          const score = data.progressMap.get(c.id) ?? null;
          const m = masteryBadge(score);
          const done = score != null && score >= 80;
          return (
            <Link
              key={c.id}
              to="/chapters/$chapterId"
              params={{ chapterId: c.id }}
              className={`card-lift animate-fade-up stagger-${Math.min(idx + 1, 6)} flex items-center gap-3.5 rounded-2xl border bg-card p-4 shadow-soft`}
            >
              <span
                className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                  done
                    ? "bg-gradient-to-br from-accent to-primary text-primary-foreground shadow-glow"
                    : "bg-accent/10 text-accent"
                }`}
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{c.title}</span>
                <span className="mt-1.5 block h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-accent to-accent/70 transition-all duration-700"
                    style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }}
                  />
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${m.cls}`}>{m.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
