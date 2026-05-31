import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Why service-role: invite_codes is no longer readable by authenticated users
// (see migration tightening RLS), and we need to update profiles.student_type
// + profiles.batch_id which are protected by a BEFORE UPDATE trigger that
// reverts those columns for non-admins. The service-role client bypasses both.
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

    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("invite_codes")
      .select("code, batch_id, used_count, max_uses, expires_at")
      .eq("code", data.code)
      .maybeSingle();

    if (inviteErr) throw new Error(inviteErr.message);
    if (!invite) return { ok: false as const, reason: "not_found" as const };
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { ok: false as const, reason: "expired" as const };
    }
    if ((invite.used_count ?? 0) >= (invite.max_uses ?? 0)) {
      return { ok: false as const, reason: "exhausted" as const };
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ batch_id: invite.batch_id, student_type: "internal" })
      .eq("id", userId);
    if (profErr) throw new Error(profErr.message);

    const { error: incErr } = await supabaseAdmin
      .from("invite_codes")
      .update({ used_count: (invite.used_count ?? 0) + 1 })
      .eq("code", invite.code);
    if (incErr) throw new Error(incErr.message);

    return { ok: true as const };
  });

// Marks a freshly-signed-up user as an external student when they did not
// supply an invite code. Uses the service-role client because student_type
// is a protected profile column.
const MarkInput = z.object({ userId: z.string().uuid() });

export const markExternalStudent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MarkInput.parse(data))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ student_type: "external" })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
