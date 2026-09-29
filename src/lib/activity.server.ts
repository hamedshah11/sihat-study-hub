import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { nextStreak } from "@/lib/streak";

// Shared XP + streak helpers for server functions (study.functions.ts,
// exam.functions.ts). Server-only: uses the service-role client.
//
// Server-controlled XP amounts. The client never gets to choose these.
// Mirrored in supabase/functions/_shared/activity.ts for edge functions.
export const XP_AMOUNTS = {
  flashcard: 1,
  quiz: 10,
  quiz_pass: 15,
  tutor: 2,
  exam: 20,
  exam_pass: 35,
} as const;

export type XpSource = keyof typeof XP_AMOUNTS;

// Pakistan Standard Time is UTC+5 with no DST. Streaks roll over at PKT midnight.
export function pakistanDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ISO timestamp of the most recent PKT midnight. */
export function startOfTodayPkt(): string {
  return new Date(`${pakistanDate()}T00:00:00+05:00`).toISOString();
}

export async function insertXp(userId: string, source: XpSource): Promise<void> {
  await supabaseAdmin
    .from("xp_events")
    .insert({ user_id: userId, amount: XP_AMOUNTS[source], source });
}

// Idempotent per PKT day: a second activity on the same day does not advance
// the streak, so this is safe to call on every qualifying action. The rules
// (including streak freezes) live in src/lib/streak.ts.
export async function bumpStreak(userId: string): Promise<void> {
  const today = pakistanDate();
  const { data: streak } = await supabaseAdmin
    .from("streaks")
    .select("current_streak, longest_streak, last_active_date, freezes_available")
    .eq("user_id", userId)
    .maybeSingle();

  if (!streak) {
    await supabaseAdmin.from("streaks").insert({
      user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      last_active_date: today,
      freezes_available: 1,
    });
    return;
  }

  const next = nextStreak(streak, today);
  if (!next) return;
  await supabaseAdmin
    .from("streaks")
    .update({
      current_streak: next.current_streak,
      longest_streak: next.longest_streak,
      last_active_date: next.last_active_date,
      freezes_available: next.freezes_available,
    })
    .eq("user_id", userId);
}
