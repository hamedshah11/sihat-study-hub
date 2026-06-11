import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import * as Icons from "lucide-react";
import { ArrowRight, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/subjects/")({
  head: () => ({ meta: [{ title: "Subjects — Sihat" }] }),
  component: SubjectsList,
});

function toPascal(s: string) {
  return s.split(/[-_\s]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("");
}

function SubjectIcon({ name, className }: { name?: string | null; className?: string }) {
  const key = name ? toPascal(name) : "";
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[key] || BookOpen;
  return <Cmp className={className ?? "size-6"} />;
}

// Stable subtle accent per subject (hash → palette)
const ACCENTS = [
  { bar: "#2D9D9B", chipBg: "rgba(45,157,155,0.10)", chipFg: "#1F7A78" },
  { bar: "#1F3A5F", chipBg: "rgba(31,58,95,0.08)",  chipFg: "#1F3A5F" },
  { bar: "#7C3AED", chipBg: "rgba(124,58,237,0.10)", chipFg: "#5B21B6" },
  { bar: "#0EA5A4", chipBg: "rgba(14,165,164,0.10)", chipFg: "#0F766E" },
  { bar: "#D97706", chipBg: "rgba(217,119,6,0.10)",  chipFg: "#92400E" },
  { bar: "#DB2777", chipBg: "rgba(219,39,119,0.10)", chipFg: "#9D174D" },
];
function accentFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
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
      <header className="animate-fade-up">
        <h1 className="font-display text-[26px] font-bold text-primary tracking-tight">Your Subjects</h1>
        <p className="caption mt-1">{data?.semesterName ?? "…"}</p>
      </header>

      <div className="mt-6 grid gap-4 grid-cols-1 md:grid-cols-2">
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}

        {!isLoading && data?.subjects.length === 0 && (
          <div className="md:col-span-2 rounded-2xl border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BookOpen className="size-5" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              No subjects are published yet — check back soon.
            </p>
          </div>
        )}

        {!isLoading && data?.subjects.map((s, i) => {
          const a = accentFor(s.id);
          return (
            <Link
              key={s.id}
              to="/subjects/$subjectId"
              params={{ subjectId: s.id }}
              className={`card-lift animate-fade-up stagger-${Math.min(i + 1, 6)} group relative block overflow-hidden rounded-2xl border bg-card p-5 shadow-soft`}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: `linear-gradient(90deg, ${a.bar}, transparent 85%)` }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-[0.07] transition-transform duration-300 group-hover:scale-125"
                style={{ background: a.bar }}
              />
              <div className="flex items-start gap-3">
                <div
                  className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl shadow-soft"
                  style={{ background: a.chipBg, color: a.chipFg }}
                >
                  <SubjectIcon name={s.icon} className="size-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-foreground leading-tight">{s.name}</h3>
                  {s.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{s.description}</p>
                  )}
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Not started</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
