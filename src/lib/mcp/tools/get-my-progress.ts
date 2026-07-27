import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_my_progress",
  title: "Get my progress",
  description:
    "Return the signed-in user's XP total, current streak, and longest streak.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    if (!userId) return unauthenticated();
    const [{ data: xp }, { data: streak }] = await Promise.all([
      sb.from("xp_events").select("amount").eq("user_id", userId),
      sb
        .from("streaks")
        .select("current_streak, longest_streak, last_active_date")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const totalXp = (xp ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);
    const result = {
      total_xp: totalXp,
      current_streak: streak?.current_streak ?? 0,
      longest_streak: streak?.longest_streak ?? 0,
      last_active_date: streak?.last_active_date ?? null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
