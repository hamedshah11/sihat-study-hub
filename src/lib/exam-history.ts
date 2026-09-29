import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Reads the signed-in student's own exam attempts (RLS: own rows only).

export type ExamAttemptRow = {
  id: string;
  subject_id: string;
  mode: string;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  score: number | null;
  total_questions: number;
  subjects: { name: string } | null;
};

export type ExamSummary = {
  attempts: number;
  last: { pct: number; score: number; total: number } | null;
  best: number | null;
  hasUnfinished: boolean;
};

export function pctOf(r: { score: number | null; total_questions: number }) {
  return r.total_questions ? Math.round(((r.score ?? 0) / r.total_questions) * 100) : 0;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Load the signed-in student's exam attempts (RLS limits this to their own). */
export async function loadAttempts(subjectId?: string, limit = 50): Promise<ExamAttemptRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  let q = supabase
    .from("exam_attempts")
    .select(
      "id, subject_id, mode, started_at, expires_at, submitted_at, score, total_questions, subjects(name)",
    )
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (subjectId) q = q.eq("subject_id", subjectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ExamAttemptRow[];
}

/** Attempt count, last and best score for one subject (for the subject page card). */
export function useExamSummary(subjectId: string) {
  return useQuery({
    queryKey: ["exam-summary", subjectId],
    queryFn: async (): Promise<ExamSummary> => {
      const rows = await loadAttempts(subjectId);
      const done = rows.filter((r) => r.submitted_at);
      const last = done[0];
      return {
        attempts: done.length,
        last: last
          ? { pct: pctOf(last), score: last.score ?? 0, total: last.total_questions }
          : null,
        best: done.length ? Math.max(...done.map(pctOf)) : null,
        hasUnfinished: rows.some((r) => !r.submitted_at),
      };
    },
  });
}
