// Streak rules, shared by the server (activity.server.ts) and the screens
// that show the streak (Home, Progress). Pure functions, safe in browser code.
//
// supabase/functions/_shared/activity.ts has a Deno copy of nextStreak for
// the edge functions. Keep the two in sync.
//
// Days are Pakistan Standard Time calendar days ("YYYY-MM-DD", UTC+5, no DST).

/** A streak freeze covers one missed day. */
export const MAX_FREEZES = 2;
/** A freeze is earned every time the streak reaches a multiple of this. */
export const FREEZE_EVERY_DAYS = 7;

export type StreakRow = {
  current_streak: number | null;
  longest_streak: number | null;
  last_active_date: string | null;
  freezes_available: number | null;
};

export function pktDay(d: Date = new Date()): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both "YYYY-MM-DD". */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * The streak after studying on `today`. Returns null when nothing changes
 * (already active today).
 */
export function nextStreak(
  prev: StreakRow,
  today: string,
): {
  current_streak: number;
  longest_streak: number;
  last_active_date: string;
  freezes_available: number;
  usedFreeze: boolean;
} | null {
  if (prev.last_active_date === today) return null;
  const gap = prev.last_active_date ? daysBetween(prev.last_active_date, today) : Infinity;
  let freezes = prev.freezes_available ?? 0;
  let current: number;
  let usedFreeze = false;
  if (gap === 1) {
    current = (prev.current_streak ?? 0) + 1;
  } else if (gap === 2 && freezes > 0) {
    // Missed exactly one day: spend a freeze to keep the streak alive.
    freezes -= 1;
    usedFreeze = true;
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
    usedFreeze,
  };
}

/**
 * The streak to show right now. The stored number only changes when the
 * student studies, so without this a streak that has already been broken
 * would keep showing its old value.
 */
export function displayStreak(
  row: Partial<StreakRow> | null | undefined,
  today = pktDay(),
): number {
  if (!row?.last_active_date) return 0;
  const gap = daysBetween(row.last_active_date, today);
  if (gap <= 1) return row.current_streak ?? 0;
  // One missed day is still recoverable if a freeze is available.
  if (gap === 2 && (row.freezes_available ?? 0) > 0) return row.current_streak ?? 0;
  return 0;
}
