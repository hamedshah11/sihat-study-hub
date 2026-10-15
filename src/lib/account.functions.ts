import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// "Delete my account" in Settings. Deleting the auth user removes everything
// keyed to it: every user table references auth.users with ON DELETE CASCADE
// (profile, reviews, quiz and exam history, answers, tutor chats, reports,
// settings, circle memberships, client errors). Two things need a hand first:
// user_badges has no foreign key, and a study circle the student started
// would vanish for its other members, so it passes to the longest-standing
// member instead.
//
// Staff accounts can't delete themselves here, so the faculty console can't
// lose its last admin by accident; an admin removes staff accounts instead.

const Input = z.object({ confirm: z.literal("DELETE") });

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "staff" | "failed" };

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ context }): Promise<DeleteAccountResult> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.role === "admin" || profile?.role === "instructor") {
      return { ok: false, reason: "staff" };
    }

    const db = supabaseAdmin as unknown as {
      from: (t: string) => ReturnType<typeof supabaseAdmin.from>;
    };

    // Hand over circles this student started, if anyone else is in them.
    const { data: circles } = await db.from("study_circles").select("id").eq("created_by", userId);
    for (const circle of (circles ?? []) as { id: string }[]) {
      const { data: next } = await db
        .from("study_circle_members")
        .select("user_id")
        .eq("circle_id", circle.id)
        .neq("user_id", userId)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const heir = (next as { user_id: string } | null)?.user_id;
      if (heir) {
        await db
          .from("study_circles")
          .update({ created_by: heir } as never)
          .eq("id", circle.id);
      }
    }

    await db.from("user_badges").delete().eq("user_id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("deleteMyAccount failed", error.message);
      return { ok: false, reason: "failed" };
    }
    return { ok: true };
  });
