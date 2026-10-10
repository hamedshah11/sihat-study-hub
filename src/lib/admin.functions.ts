import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const requireAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.role !== "admin") {
      throw new Error("Forbidden: admin only");
    }

    return { ok: true as const };
  });

export const listStaffQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ chapterId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (profile?.role !== "admin" && profile?.role !== "instructor") {
      throw new Error("Forbidden: staff only");
    }

    const { data: questions, error } = await supabaseAdmin
      .from("questions")
      .select("id, prompt, options, correct_index, explanation, status, difficulty")
      .eq("chapter_id", data.chapterId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return questions ?? [];
  });

// ---------------------------------------------------------------------------
// updateStaffQuestion — a teacher edits an AI draft from the review screen.
// Editing a question resets its approval: it goes back to "draft" so it is
// reviewed again before students see it.
// ---------------------------------------------------------------------------

const UpdateQuestionInput = z.object({
  id: z.string().uuid(),
  prompt: z.string().trim().min(5).max(1000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctIndex: z.number().int().min(0).max(5),
  explanation: z.string().trim().max(1500).nullable(),
});

export const updateStaffQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateQuestionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.role !== "admin" && profile?.role !== "instructor") {
      throw new Error("Forbidden: staff only");
    }
    if (data.correctIndex >= data.options.length)
      throw new Error("Pick one of the options as correct");
    const { error } = await supabaseAdmin
      .from("questions")
      .update({
        prompt: data.prompt,
        options: data.options,
        correct_index: data.correctIndex,
        explanation: data.explanation || null,
        status: "draft",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
