import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import * as Icons from "lucide-react";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/subjects/")({
  head: () => ({ meta: [{ title: "Subjects — Sihat" }] }),
  component: SubjectsList,
});

function toPascal(s: string) {
  return s.split(/[-_\s]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("");
}

function SubjectIcon({ name }: { name?: string | null }) {
  const key = name ? toPascal(name) : "";
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[key] || BookOpen;
  return <Cmp className="size-6 text-accent" />;
}

function SubjectsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["subjects-list"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { semesterName: null, subjects: [] as any[] };

      const { data: profile } = await supabase
        .from("profiles").select("batch_id").eq("id", user.id).maybeSingle();

      let currentSemesterNumber: number | null = null;
      let semesterName: string | null = null;

      if (profile?.batch_id) {
        const { data: batch } = await supabase
          .from("batches").select("current_semester_id").eq("id", profile.batch_id).maybeSingle();
        if (batch?.current_semester_id) {
          const { data: sem } = await supabase
            .from("semesters").select("name, number").eq("id", batch.current_semester_id).maybeSingle();
          if (sem) {
            currentSemesterNumber = sem.number;
            semesterName = sem.name;
          }
        }
      }

      const { data: semesters } = await supabase
        .from("semesters").select("id, number");
      const semMap = new Map((semesters ?? []).map(s => [s.id, s.number]));
      const allowedSemIds = currentSemesterNumber == null
        ? null
        : new Set((semesters ?? []).filter(s => s.number <= currentSemesterNumber).map(s => s.id));

      const { data: subjects } = await supabase
        .from("subjects").select("id, name, description, icon, display_order, semester_id");

      const filtered = (subjects ?? [])
        .filter(s => !allowedSemIds || (s.semester_id && allowedSemIds.has(s.semester_id)))
        .map(s => ({ ...s, _semNum: s.semester_id ? semMap.get(s.semester_id) ?? 99 : 99 }))
        .sort((a, b) => a._semNum - b._semNum || (a.display_order ?? 0) - (b.display_order ?? 0));

      return { semesterName: semesterName ?? "All semesters", subjects: filtered };
    },
  });

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold text-primary">Your Subjects</h1>
        <p className="text-sm text-muted-foreground mt-1">{data?.semesterName ?? "…"}</p>
      </header>

      <div className="mt-6 grid gap-4 grid-cols-1 md:grid-cols-2">
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}

        {!isLoading && data?.subjects.length === 0 && (
          <div className="md:col-span-2 rounded-xl bg-surface p-6 text-sm text-muted-foreground">
            No subjects are published yet. Check back soon.
          </div>
        )}

        {!isLoading && data?.subjects.map(s => (
          <Link
            key={s.id}
            to="/subjects/$subjectId"
            params={{ subjectId: s.id }}
            className="block rounded-xl border bg-card p-5 transition-colors hover:border-accent/40 hover:bg-accent/5 active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <div className="inline-flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <SubjectIcon name={s.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{s.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{s.description}</p>
              </div>
            </div>
            <Progress value={0} className="mt-4 h-1.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
