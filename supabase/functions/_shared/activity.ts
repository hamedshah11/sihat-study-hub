// Shared XP + streak award for edge functions (tutor-ask, tutor-practice).
// Uses the service-role `admin` client so writes succeed after the integrity
// tables are locked to read-only for normal users. XP amounts are fixed here
// so the client can never choose them.

export const XP_AMOUNTS = { flashcard: 1, quiz: 10, quiz_pass: 15, tutor: 2 } as const;
export type XpSource = keyof typeof XP_AMOUNTS;

// Pakistan Standard Time is UTC+5, no DST. Streaks roll over at PKT midnight.
function pktDate(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
export async function awardXpAndStreak(admin: any, userId: string, source: XpSource): Promise<void> {
  await admin.from("xp_events").insert({ user_id: userId, amount: XP_AMOUNTS[source], source });

  const today = pktDate();
  const { data: streak } = await admin
    .from("streaks")
    .select("current_streak, longest_streak, last_active_date, freezes_available")
    .eq("user_id", userId)
    .maybeSingle();

  if (!streak) {
    await admin.from("streaks").insert({
      user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      last_active_date: today,
      freezes_available: 1,
    });
    return;
  }
  if (streak.last_active_date === today) return;

  const yesterday = pktDate(new Date(Date.now() - 86400000));
  const continued = streak.last_active_date === yesterday;
  const newCurrent = continued ? (streak.current_streak ?? 0) + 1 : 1;
  const newLongest = Math.max(streak.longest_streak ?? 0, newCurrent);
  await admin
    .from("streaks")
    .update({ current_streak: newCurrent, longest_streak: newLongest, last_active_date: today })
    .eq("user_id", userId);
}
