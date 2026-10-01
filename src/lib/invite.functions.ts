import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
