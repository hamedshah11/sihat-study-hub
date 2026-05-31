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
      <Link to="/subjects" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Subjects
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-primary">{data.subject.name}</h1>
      {data.subject.description && (
        <p className="mt-1 text-sm text-muted-foreground">{data.subject.description}</p>
      )}

      <h2 className="mt-8 text-lg font-semibold text-primary">Chapters</h2>
      <div className="mt-3 space-y-2">
        {data.chapters.length === 0 && (
          <div className="rounded-xl bg-surface p-6 text-sm text-muted-foreground">
            No chapters published yet.
          </div>
        )}
        {data.chapters.map((c, idx) => {
          const m = masteryBadge(data.progressMap.get(c.id) ?? null);
          return (
            <Link
              key={c.id}
              to="/chapters/$chapterId"
              params={{ chapterId: c.id }}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-accent/40 hover:bg-accent/5 active:scale-[0.99]"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-accent/10 text-sm font-semibold text-accent">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 font-medium text-foreground">{c.title}</span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${m.cls}`}>{m.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
