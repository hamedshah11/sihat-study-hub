import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FOUNDING_PARTNER } from "@/lib/brand";

// Why service-role: invite_codes is no longer readable by authenticated users
// (see migration tightening RLS), and we need to update profiles.student_type
// + profiles.batch_id which are protected by a BEFORE UPDATE trigger that
// reverts those columns for non-admins. The migration explicitly recognises
// trusted service-role requests in that trigger.
//
// The user id is derived from the verified session (requireSupabaseAuth)
// rather than the request body, so a caller cannot apply an invite code on
// behalf of another user.

const ApplyInput = z.object({
  code: z.string().trim().min(1).max(64),
});

export const applyInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ApplyInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    // The database function locks both rows and performs the capacity check,
    // profile assignment and use-count increment in one transaction. It also
    // refuses to move a student who already belongs to a batch.
    const { data: result, error } = await supabaseAdmin.rpc("redeem_invite_code", {
      p_code: data.code,
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);

    if (result === "ok") return { ok: true as const };
    if (
      result === "not_found" ||
      result === "expired" ||
      result === "exhausted" ||
      result === "already_enrolled"
    ) {
      return { ok: false as const, reason: result };
    }
    throw new Error("Could not enrol this account");
  });

// ---------------------------------------------------------------------------
// previewBatchCode — the join flow's "Code found. Is this you?" step. Shows
// the college, programme, semester and what's ready before anything is saved
// or any account exists. It never redeems the code. Only these few
// non-personal facts about a valid code are returned.
// ---------------------------------------------------------------------------

const PreviewInput = z.object({ code: z.string().trim().min(1).max(64) });

export type BatchPreview =
  | {
      ok: true;
      college: string;
      programme: string | null;
      batch: string;
      semester: string | null;
      subjects: number;
      chaptersReady: number;
    }
  | { ok: false; reason: "not_found" | "expired" | "exhausted" };

export const previewBatchCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PreviewInput.parse(data))
  .handler(async ({ data }): Promise<BatchPreview> => {
    const { data: invite } = await supabaseAdmin
      .from("invite_codes")
      .select("batch_id, expires_at, max_uses, used_count")
      .eq("code", data.code.trim())
      .maybeSingle();
    if (!invite?.batch_id) return { ok: false, reason: "not_found" };
    if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) return { ok: false, reason: "expired" };
    if (invite.max_uses != null && (invite.used_count ?? 0) >= invite.max_uses) {
      return { ok: false, reason: "exhausted" };
    }
    const { data: batch } = await supabaseAdmin
      .from("batches")
      .select("name, program_id, current_semester_id")
      .eq("id", invite.batch_id)
      .maybeSingle();
    if (!batch) return { ok: false, reason: "not_found" };
    const [{ data: programme }, { data: semester }, { data: subjects }] = await Promise.all([
      batch.program_id
        ? supabaseAdmin.from("programs").select("name").eq("id", batch.program_id).maybeSingle()
        : Promise.resolve({ data: null }),
      batch.current_semester_id
        ? supabaseAdmin.from("semesters").select("name").eq("id", batch.current_semester_id).maybeSingle()
        : Promise.resolve({ data: null }),
      batch.current_semester_id
        ? supabaseAdmin.from("subjects").select("id").eq("semester_id", batch.current_semester_id)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);
    const subjectIds = (subjects ?? []).map((s) => s.id);
    const { count } = subjectIds.length
      ? await supabaseAdmin
          .from("chapters")
          .select("id", { count: "exact", head: true })
          .in("subject_id", subjectIds)
          .eq("status", "published")
      : { count: 0 };
    return {
      ok: true,
      college: FOUNDING_PARTNER.display,
      programme: programme?.name ?? null,
      batch: batch.name,
      semester: semester?.name ?? null,
      subjects: subjectIds.length,
      chaptersReady: count ?? 0,
    };
  });
