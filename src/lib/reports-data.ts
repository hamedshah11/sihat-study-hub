import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Faculty reads of student reports (RLS: staff only; table from the Florence
// migration). Until the migration is applied every read returns
// { available: false } and the console simply hides the queue.

export type ContentReport = {
  id: string;
  kind: "question" | "flashcard";
  item_id: string;
  chapter_id: string | null;
  reason: string;
  note: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

export const REPORT_REASON_LABEL: Record<string, string> = {
  wrong_answer: "Answer looks wrong",
  unclear: "Question is unclear",
  typo: "Typo",
  outdated: "Doesn't match teaching",
  other: "Something else",
};

const reportsTable = () =>
  (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(
    "content_reports",
  );

export function useOpenReports(chapterId?: string) {
  return useQuery({
    queryKey: ["content-reports", chapterId ?? "all"],
    queryFn: async (): Promise<{ available: boolean; reports: ContentReport[] }> => {
      let q = reportsTable()
        .select("id, kind, item_id, chapter_id, reason, note, status, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(500);
      if (chapterId) q = q.eq("chapter_id", chapterId);
      const { data, error } = await q;
      if (error) return { available: false, reports: [] };
      return { available: true, reports: (data ?? []) as unknown as ContentReport[] };
    },
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return async (id: string, status: "resolved" | "dismissed") => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await reportsTable()
      .update({
        status,
        resolved_by: user?.id ?? null,
        resolved_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
    await qc.invalidateQueries({ queryKey: ["content-reports"] });
    if (error) throw new Error(error.message);
  };
}
