// Shared XP + streak award for edge functions (tutor-ask, tutor-practice).
// Uses the service-role `admin` client so writes succeed after the integrity
// tables are locked to read-only for normal users. XP amounts are fixed here
// so the client can never choose them.

export const XP_AMOUNTS = { flashcard: 1, quiz: 10, quiz_pass: 15, tutor: 2, exam: 20, exam_pass: 35 } as const;
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
  const next = nextStreak(streak, today);
  if (!next) return;
  await admin
    .from("streaks")
    .update(next)
    .eq("user_id", userId);
}

// Deno copy of nextStreak from src/lib/streak.ts. Keep the two in sync.
// A streak freeze covers one missed day; one is earned every 7 streak days
// (max 2).
const MAX_FREEZES = 2;
const FREEZE_EVERY_DAYS = 7;

type StreakRow = {
  current_streak: number | null;
  longest_streak: number | null;
  last_active_date: string | null;
  freezes_available: number | null;
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function nextStreak(prev: StreakRow, today: string) {
  if (prev.last_active_date === today) return null;
  const gap = prev.last_active_date ? daysBetween(prev.last_active_date, today) : Infinity;
  let freezes = prev.freezes_available ?? 0;
  let current: number;
  if (gap === 1) {
    current = (prev.current_streak ?? 0) + 1;
  } else if (gap === 2 && freezes > 0) {
    freezes -= 1;
    current = (prev.current_streak ?? 0) + 1;
  } else {
    current = 1;
  }
  if (current % FREEZE_EVERY_DAYS === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
  return {
    current_streak: current,
    longest_streak: Math.max(prev.longest_streak ?? 0, current),
    last_active_date: today,
    freezes_available: freezes,
  };
}
