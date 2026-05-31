import { supabase } from "@/integrations/supabase/client";

const TOTAL_BADGES = 8;

let cachedAllEarned: { userId: string; all: boolean } | null = null;

/**
 * Invoke the award-badges edge function. Skips entirely if we know the user
 * already has every badge (cached after a previous response).
 */
export async function awardBadgesIfNeeded(): Promise<string[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  if (cachedAllEarned?.userId === userId && cachedAllEarned.all) {
    return [];
  }

  // First call this session: confirm whether all are already earned to skip future calls.
  if (cachedAllEarned?.userId !== userId) {
    const { count } = await supabase
      .from("user_badges")
      .select("badge_id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= TOTAL_BADGES) {
      cachedAllEarned = { userId, all: true };
      return [];
    }
    cachedAllEarned = { userId, all: false };
  }

  const { data, error } = await supabase.functions.invoke("award-badges");
  if (error) {
    console.error("award-badges invoke failed", error);
    return [];
  }
  const awarded = (data?.awarded ?? []) as string[];
  if (data?.allEarned) cachedAllEarned = { userId, all: true };
  return awarded;
}
