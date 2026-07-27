import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_questions",
  title: "List questions",
  description:
    "List questions (with answer key) for a chapter. Staff-only: exposes correct_index and explanation.",
  inputSchema: {
    chapter_id: z.string().uuid().describe("Chapter UUID from list_chapters."),
    status: z
      .enum(["approved", "draft", "rejected", "all"])
      .optional()
      .describe("Filter by status. Defaults to 'approved'. Staff-only."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ chapter_id, status }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);

    const userId = ctx.getUserId();
    if (!userId) return unauthenticated();
    const { data: isStaff, error: staffError } = await sb.rpc("is_staff", {
      _user_id: userId,
    });
    if (staffError) return { content: [{ type: "text", text: staffError.message }], isError: true };
    if (!isStaff) {
      return {
        content: [{ type: "text", text: "This tool requires staff access." }],
        isError: true,
      };
    }

    const effectiveStatus = status ?? "approved";
    let query = sb
      .from("questions")
      .select("id, prompt, options, correct_index, explanation, difficulty, status")
      .eq("chapter_id", chapter_id)
      .order("created_at", { ascending: true });
    if (effectiveStatus !== "all") query = query.eq("status", effectiveStatus);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { questions: data ?? [] },
    };
  },
});
