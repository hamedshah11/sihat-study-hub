import { supabase } from "@/integrations/supabase/client";

export type StudyActivitySource = "flashcard" | "quiz" | "quiz_pass" | "tutor";

const XP_AMOUNTS: Record<StudyActivitySource, number> = {
  flashcard: 1,
  quiz: 10,
  quiz_pass: 15,
  tutor: 2,
};

// Pakistan Standard Time is UTC+5 with no DST.
function pakistanDate(d: Date = new Date()): string {
  const pkt = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return pkt.toISOString().slice(0, 10);
}

export async function recordStudyActivity(source: StudyActivitySource) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;

  await supabase.from("xp_events").insert({
    user_id: userId,
    amount: XP_AMOUNTS[source],
    source,
  });

  const today = pakistanDate();
  const { data: streak } = await supabase
    .from("streaks")
    .select("current_streak, longest_streak, last_active_date, freezes_available")
    .eq("user_id", userId)
    .maybeSingle();

  if (!streak) {
    await supabase.from("streaks").insert({
      user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      last_active_date: today,
      freezes_available: 1,
    });
    return;
  }

  if (streak.last_active_date === today) return;

  const yesterday = pakistanDate(new Date(Date.now() - 86400000));
  const continued = streak.last_active_date === yesterday;
  const newCurrent = continued ? (streak.current_streak ?? 0) + 1 : 1;
  const newLongest = Math.max(streak.longest_streak ?? 0, newCurrent);
  await supabase
    .from("streaks")
    .update({
      current_streak: newCurrent,
      longest_streak: newLongest,
      last_active_date: today,
    })
    .eq("user_id", userId);
}
