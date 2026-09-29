import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { getExamResult, type ExamPayload, type ExamResult } from "@/lib/exam.functions";
import { ExamSetup } from "@/components/exam/ExamSetup";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { ExamResults } from "@/components/exam/ExamResults";
import { MISTAKES_QUERY_KEY } from "@/lib/mistakes-data";

const searchSchema = z.object({
  result: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/subjects/$subjectId_/exam")({
  head: () => ({ meta: [{ title: "Exam — Sihat" }] }),
  validateSearch: (search) => searchSchema.parse(search),
  component: ExamPage,
});

function ExamPage() {
  const { subjectId } = Route.useParams();
  const { result: resultId } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [freshResult, setFreshResult] = useState<ExamResult | null>(null);
  const fetchResult = useServerFn(getExamResult);

  const { data: subject } = useQuery({
    queryKey: ["subject-name", subjectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("id", subjectId)
        .maybeSingle();
      return data;
    },
  });

  // A past result opened from history (?result=<attemptId>).
  const pastResult = useQuery({
    queryKey: ["exam-result", resultId],
    enabled: !!resultId && freshResult?.attemptId !== resultId,
    queryFn: () => fetchResult({ data: { attemptId: resultId! } }),
  });

  const backToSetup = () => {
    setExam(null);
    setFreshResult(null);
    qc.invalidateQueries({ queryKey: ["exam-overview", subjectId] });
    navigate({ to: "/subjects/$subjectId/exam", params: { subjectId }, search: {} });
  };

  // While an exam is running, the runner owns the whole screen.
  if (exam) {
    return (
      <ExamRunner
        exam={exam}
        subjectName={subject?.name ?? "Exam"}
        onSubmitted={(r) => {
          setExam(null);
          setFreshResult(r);
          qc.invalidateQueries({ queryKey: ["exam-overview", subjectId] });
          qc.invalidateQueries({ queryKey: ["home-today"] });
          qc.invalidateQueries({ queryKey: ["student-progress"] });
          qc.invalidateQueries({ queryKey: ["exam-summary", subjectId] });
          qc.invalidateQueries({ queryKey: ["recent-exams"] });
          qc.invalidateQueries({ queryKey: MISTAKES_QUERY_KEY });
          navigate({
            to: "/subjects/$subjectId/exam",
            params: { subjectId },
            search: { result: r.attemptId },
            replace: true,
          });
        }}
      />
    );
  }

  const shownResult =
    freshResult && (!resultId || freshResult.attemptId === resultId)
      ? freshResult
      : resultId
        ? pastResult.data
        : null;

  return (
    <div>
      <header className="animate-fade-up">
        <Link
          to="/subjects/$subjectId"
          params={{ subjectId }}
          className="inline-flex items-center gap-1 rounded-full border bg-card py-1.5 pl-2 pr-3.5 text-sm font-medium text-muted-foreground shadow-soft transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> {subject?.name ?? "Subject"}
        </Link>
      </header>

      {resultId && !shownResult ? (
        pastResult.isError ? (
          <div className="mt-6 rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-soft">
            Couldn't load this result.{" "}
            <button className="font-semibold text-accent" onClick={backToSetup}>
              Back to exams
            </button>
          </div>
        ) : (
          <Skeleton className="mt-6 h-64 rounded-2xl" />
        )
      ) : shownResult ? (
        <ExamResults
          result={shownResult}
          celebrateOnMount={shownResult === freshResult}
          onDone={backToSetup}
        />
      ) : (
        <ExamSetup
          subjectId={subjectId}
          subjectName={subject?.name ?? null}
          onStarted={setExam}
          onOpenResult={(id) =>
            navigate({
              to: "/subjects/$subjectId/exam",
              params: { subjectId },
              search: { result: id },
            })
          }
        />
      )}
    </div>
  );
}
