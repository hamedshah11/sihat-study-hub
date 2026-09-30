import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildHistory,
  dueMistakes,
  pendingMistakes,
  type AnswerRecord,
  type QuestionHistory,
} from "@/lib/mistakes";

// Browser-side reads of the student's own answer log (RLS: own rows only).
// Any failure (e.g. the table isn't created yet) is treated as "no history",
// so quizzes and Home keep working.

const MAX_ROWS = 5000;

export async function loadAnswerLog(chapterId?: string): Promise<AnswerRecord[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    let q = supabase
      .from("question_answers")
      .select("question_id, chapter_id, correct, answered_at")
      .eq("user_id", user.id)
      .order("answered_at", { ascending: false })
      .limit(MAX_ROWS);
    if (chapterId) q = q.eq("chapter_id", chapterId);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as AnswerRecord[];
  } catch {
    return [];
  }
}

export type MistakeState = {
  history: Map<string, QuestionHistory>;
  due: QuestionHistory[];
  pending: number;
};

export const MISTAKES_QUERY_KEY = ["mistakes"] as const;

/** Mistakes due now across all subjects, plus how many are coming back later. */
export function useMistakes() {
  return useQuery({
    queryKey: MISTAKES_QUERY_KEY,
    queryFn: async (): Promise<MistakeState> => {
      const history = buildHistory(await loadAnswerLog());
      return { history, due: dueMistakes(history), pending: pendingMistakes(history) };
    },
  });
}
