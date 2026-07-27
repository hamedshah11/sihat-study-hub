import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_chapters",
  title: "List chapters",
  description: "List chapters for a subject, ordered by their display order.",
  inputSchema: {
    subject_id: z.string().uuid().describe("Subject UUID from list_subjects."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ subject_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("chapters")
      .select("id, title, display_order, subject_id")
      .eq("subject_id", subject_id)
      .order("display_order", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { chapters: data ?? [] },
    };
  },
});
