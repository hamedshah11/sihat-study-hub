import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_flashcards",
  title: "List flashcards",
  description: "List approved flashcards (front/back) for a chapter.",
  inputSchema: {
    chapter_id: z.string().uuid().describe("Chapter UUID from list_chapters."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ chapter_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("flashcards")
      .select("id, front, back, hint, status")
      .eq("chapter_id", chapter_id)
      .eq("status", "approved");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { flashcards: data ?? [] },
    };
  },
});
