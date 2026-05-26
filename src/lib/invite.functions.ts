import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({
  userId: z.string().uuid(),
  code: z.string().trim().min(1).max(64),
});

export const applyInviteCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("invite_codes")
      .select("code, batch_id, used_count, max_uses, expires_at")
      .eq("code", data.code)
      .maybeSingle();

    if (inviteErr) throw new Error(inviteErr.message);
    if (!invite) return { ok: false, reason: "not_found" as const };
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { ok: false, reason: "expired" as const };
    }
    if ((invite.used_count ?? 0) >= (invite.max_uses ?? 0)) {
      return { ok: false, reason: "exhausted" as const };
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ batch_id: invite.batch_id, student_type: "internal" })
      .eq("id", data.userId);
    if (profErr) throw new Error(profErr.message);

    const { error: incErr } = await supabaseAdmin
      .from("invite_codes")
      .update({ used_count: (invite.used_count ?? 0) + 1 })
      .eq("code", invite.code);
    if (incErr) throw new Error(incErr.message);

    return { ok: true as const };
  });
