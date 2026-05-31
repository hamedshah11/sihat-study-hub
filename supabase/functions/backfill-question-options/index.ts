// Supabase Edge Function: backfill-question-options
// Admin/instructor-only. Re-shuffles options + correct_index on every existing
// question to counter LLM positional bias in historical data. Safe to run once.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { shuffleOptions } from "../_shared/shuffle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) {
      console.error("profile lookup error", profileErr);
      return json({ error: "Could not verify user role." }, 500);
    }
    if (!profile || (profile.role !== "admin" && profile.role !== "instructor")) {
      return json({ error: "Forbidden" }, 403);
    }

    const BATCH = 500;
    let from = 0;
    let updated = 0;

    while (true) {
      const { data: rows, error: selErr } = await admin
        .from("questions")
        .select("id, options, correct_index")
        .order("id", { ascending: true })
        .range(from, from + BATCH - 1);

      if (selErr) {
        console.error("select error", selErr);
        return json({ error: "Failed to read questions." }, 500);
      }
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const shuffled = shuffleOptions({
          options: row.options as unknown,
          correct_index: row.correct_index as number,
        });
        const { error: upErr } = await admin
          .from("questions")
          .update({
            options: shuffled.options,
            correct_index: shuffled.correct_index,
          })
          .eq("id", row.id);
        if (upErr) {
          console.error("update error", row.id, upErr);
          continue;
        }
        updated++;
      }

      if (rows.length < BATCH) break;
      from += BATCH;
    }

    return json({ ok: true, updated });
  } catch (e) {
    console.error("backfill-question-options error", e);
    return json({ error: "Something went wrong." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
