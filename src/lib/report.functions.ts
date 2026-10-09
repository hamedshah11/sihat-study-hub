import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Students can report a problem from any question or flashcard. Reports land
// in the faculty console's "Reported by students" queue so mistakes reach a
// teacher quickly. Writes go through here (service role) so the reporter is
// always the signed-in student and the item is checked to exist.

export const REPORT_REASONS = {
  wrong_answer: "The answer looks wrong",
  unclear: "The question is unclear",
  typo: "There's a typo",
  outdated: "It doesn't match what we were taught",
  other: "Something else",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

const ReportInput = z.object({
  kind: z.enum(["question", "flashcard"]),
  itemId: z.string().uuid(),
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
  note: z.string().trim().max(500).optional(),
});

const DAILY_REPORT_LIMIT = 20;

export const reportProblem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ReportInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const table = data.kind === "question" ? "questions" : "flashcards";
    const { data: item } = await supabaseAdmin
      .from(table)
      .select("id, chapter_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) return { ok: false as const, reason: "not_found" as const };

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from("content_reports" as never)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    // The table arrives with the Florence migration; until then, say so.
    if (countError) return { ok: false as const, reason: "unavailable" as const };
    if ((count ?? 0) >= DAILY_REPORT_LIMIT) return { ok: false as const, reason: "limit" as const };

    const { error } = await supabaseAdmin.from("content_reports" as never).insert({
      user_id: userId,
      kind: data.kind,
      item_id: data.itemId,
      chapter_id: (item as { chapter_id: string | null }).chapter_id,
      reason: data.reason,
      note: data.note || null,
    } as never);
    if (error) return { ok: false as const, reason: "unavailable" as const };
    return { ok: true as const };
  });
