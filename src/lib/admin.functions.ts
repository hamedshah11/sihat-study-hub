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
