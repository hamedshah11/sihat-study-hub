// Supabase Edge Function: tutor-ask
// Answers nursing student questions strictly from chapter notes, using Anthropic Claude.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAILY_LIMIT = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json({ error: "Tutor is not configured." }, 500);

    // Auth-scoped client to identify the user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const chapterId = String(body?.chapterId ?? "").trim();
    const question = String(body?.question ?? "").trim();
    if (!chapterId || !question) return json({ error: "Missing chapterId or question" }, 400);
    if (question.length > 1000) return json({ error: "Question too long" }, 400);

    // Admin client for trusted reads/writes.
    const admin = createClient(supabaseUrl, serviceKey);

    // Daily limit check (per user, last 24h, user messages only)
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count: todayCount } = await admin
      .from("tutor_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", since.toISOString());

    if ((todayCount ?? 0) >= DAILY_LIMIT) {
      return json({ error: "daily_limit", message: `You've reached your daily limit of ${DAILY_LIMIT} tutor questions. Try again tomorrow.` }, 429);
    }

    // Load chapter
    const { data: chapter, error: chErr } = await admin
      .from("chapters")
      .select("id, title, summary_md, subject_id")
      .eq("id", chapterId)
      .maybeSingle();
    if (chErr || !chapter) return json({ error: "Chapter not found" }, 404);

    let subjectName: string | null = null;
    if (chapter.subject_id) {
      const { data: subject } = await admin
        .from("subjects")
        .select("name")
        .eq("id", chapter.subject_id)
        .maybeSingle();
      subjectName = subject?.name ?? null;
    }

    const notes = (chapter.summary_md ?? "").trim();
    const systemPrompt = `You are Sihat Tutor, an AI study helper for nursing students in Pakistan.

STRICT RULES:
- Answer ONLY using the chapter notes provided below. Do not use outside knowledge.
- If the answer is not clearly available in the chapter notes, reply EXACTLY:
  "I don't have enough information in this chapter to answer that confidently."
- Use simple English suitable for nursing students.
- Keep answers SHORT: maximum 3 short paragraphs.
- Never invent drug doses, clinical guidelines, lab values, or emergency advice.
- Always end your reply with this exact line on its own:
  "Please verify clinical details with your instructor."

CHAPTER CONTEXT:
Subject: ${subjectName ?? "(unknown)"}
Chapter: ${chapter.title}

CHAPTER NOTES:
"""
${notes || "(No notes available for this chapter.)"}
"""`;

    // Call Anthropic
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error", anthropicRes.status, errText);
      return json({ error: "Tutor is temporarily unavailable. Please try again." }, 502);
    }

    const anthropicJson = await anthropicRes.json();
    const answer: string =
      anthropicJson?.content?.map((c: any) => c?.text ?? "").join("\n").trim() ||
      "I don't have enough information in this chapter to answer that confidently.\n\nPlease verify clinical details with your instructor.";

    // Persist both messages
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertErr } = await admin
      .from("tutor_messages")
      .insert([
        { user_id: userId, chapter_id: chapterId, role: "user", content: question, created_at: nowIso },
        { user_id: userId, chapter_id: chapterId, role: "assistant", content: answer, created_at: nowIso },
      ])
      .select("id, role");

    if (insertErr) console.error("Insert error", insertErr);
    const assistantId = inserted?.find((m) => m.role === "assistant")?.id ?? null;

    return json({ answer, messageId: assistantId });
  } catch (e) {
    console.error("tutor-ask error", e);
    return json({ error: "Something went wrong." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
