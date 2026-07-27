import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_chapter_notes",
  title: "Get chapter notes",
  description: "Return the approved Markdown study notes for a chapter.",
  inputSchema: {
    chapter_id: z.string().uuid().describe("Chapter UUID from list_chapters."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ chapter_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("chapters")
      .select("id, title, summary_md, subject_id")
      .eq("id", chapter_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Chapter not found" }], isError: true };
    return {
      content: [{ type: "text", text: data.summary_md ?? "(No notes yet.)" }],
      structuredContent: { chapter: data },
    };
  },
});
