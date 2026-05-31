// Award newly-earned badges to the authenticated user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALL_BADGES = [
  "first_quiz",
  "week_streak",
  "perfect_quiz",
  "early_bird",
  "comeback",
  "fifty_cards",
  "subject_master",
  "curious",
] as const;

type BadgeId = (typeof ALL_BADGES)[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userRes.user.id;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Already-earned badges
    const { data: earnedRows } = await admin
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", userId);
    const earned = new Set((earnedRows ?? []).map((r) => r.badge_id));

    const toCheck = ALL_BADGES.filter((b) => !earned.has(b));
    const awarded: BadgeId[] = [];

    for (const id of toCheck) {
      let ok = false;
      try {
        ok = await checkBadge(admin, userId, id);
      } catch (e) {
        console.error("badge check failed", id, e);
      }
      if (ok) awarded.push(id);
    }

    if (awarded.length) {
      const rows = awarded.map((badge_id) => ({ user_id: userId, badge_id }));
      const { error: insErr } = await admin
        .from("user_badges")
        .upsert(rows, { onConflict: "user_id,badge_id", ignoreDuplicates: true });
      if (insErr) console.error("insert badges", insErr);
    }

    return json({ awarded, allEarned: earned.size + awarded.length >= ALL_BADGES.length });
  } catch (e) {
    console.error("award-badges error", e);
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function checkBadge(admin: any, userId: string, id: BadgeId): Promise<boolean> {
  switch (id) {
    case "first_quiz": {
      const { count } = await admin
        .from("quiz_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      return (count ?? 0) >= 1;
    }
    case "week_streak": {
      const { data } = await admin
        .from("streaks")
        .select("longest_streak")
        .eq("user_id", userId)
        .maybeSingle();
      return (data?.longest_streak ?? 0) >= 7;
    }
    case "perfect_quiz": {
      const { data } = await admin
        .from("quiz_attempts")
        .select("score, total_questions")
        .eq("user_id", userId);
      return (data ?? []).some(
        (r: { score: number; total_questions: number }) =>
          r.total_questions > 0 && Number(r.score) === r.total_questions,
      );
    }
    case "early_bird": {
      // PKT (UTC+5) hour < 8, anchored on quiz_attempts.attempted_at.
      const { data } = await admin
        .from("quiz_attempts")
        .select("attempted_at")
        .eq("user_id", userId);
      for (const row of (data ?? []) as { attempted_at: string }[]) {
        const t = new Date(row.attempted_at).getTime();
        const pktHour = new Date(t + 5 * 60 * 60 * 1000).getUTCHours();
        if (pktHour < 8) return true;
      }
      return false;
    }
    case "comeback": {
      // ≥7-day gap between consecutive xp_events.occurred_at.
      const { data } = await admin
        .from("xp_events")
        .select("occurred_at")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: true });
      const times = (data ?? [])
        .map((r: { occurred_at: string }) => new Date(r.occurred_at).getTime())
        .filter((n: number) => Number.isFinite(n));
      for (let i = 1; i < times.length; i++) {
        if (times[i] - times[i - 1] >= 7 * 86400000) return true;
      }
      return false;
    }
    case "fifty_cards": {
      const { count } = await admin
        .from("flashcard_reviews")
        .select("flashcard_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("reps", 1);
      return (count ?? 0) >= 50;
    }
    case "subject_master": {
      // A subject with ≥1 published chapter where every published chapter is completed.
      const { data: subjects } = await admin.from("subjects").select("id");
      const { data: chapters } = await admin
        .from("chapters")
        .select("id, subject_id")
        .eq("status", "published");
      const { data: progress } = await admin
        .from("chapter_progress")
        .select("chapter_id, completed_at")
        .eq("user_id", userId)
        .not("completed_at", "is", null);
      const completed = new Set(
        (progress ?? []).map((r: { chapter_id: string }) => r.chapter_id),
      );
      const bySubject = new Map<string, string[]>();
      for (const c of (chapters ?? []) as { id: string; subject_id: string }[]) {
        if (!bySubject.has(c.subject_id)) bySubject.set(c.subject_id, []);
        bySubject.get(c.subject_id)!.push(c.id);
      }
      for (const s of (subjects ?? []) as { id: string }[]) {
        const ch = bySubject.get(s.id) ?? [];
        if (ch.length >= 1 && ch.every((id) => completed.has(id))) return true;
      }
      return false;
    }
    case "curious": {
      const { count } = await admin
        .from("tutor_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "user");
      return (count ?? 0) >= 10;
    }
  }
}
