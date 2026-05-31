// supabase/functions/tutor-practice/index.ts
// Viva-style recall coach. action:"next" generates a question; action:"grade" scores an answer.
// Mirrors the auth + rate-limit pattern of the existing tutor-ask function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DAILY_LIMIT = 40; // graded answers per student per day

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json({ error: "Tutor is not configured." }, 500);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim();
    const chapterId = String(body?.chapterId ?? "").trim();
    if (!chapterId) return json({ error: "Missing chapterId" }, 400);

    const { data: chapter, error: chErr } = await admin
      .from("chapters").select("id, title, summary_md, subject_id").eq("id", chapterId).maybeSingle();
    if (chErr || !chapter) return json({ error: "Chapter not found" }, 404);
    const notes = (chapter.summary_md ?? "").trim();
    if (!notes) return json({ error: "This chapter has no notes yet." }, 400);

    let subjectName: string | null = null;
    if (chapter.subject_id) {
      const { data: s } = await admin.from("subjects").select("name").eq("id", chapter.subject_id).maybeSingle();
      subjectName = s?.name ?? null;
    }
    const ctx = `Subject: ${subjectName ?? "(unknown)"}\nChapter: ${chapter.title}\n\nCHAPTER NOTES:\n"""\n${notes}\n"""`;

    if (action === "next") {
      const recent: string[] = Array.isArray(body?.recentQuestions) ? body.recentQuestions.slice(-5) : [];
      const sys = `You are Sihat Tutor, a viva (oral-exam) coach for nursing students in Pakistan.
Generate ONE open-ended recall question answerable ONLY from the chapter notes below.
RULES: Require explanation in the student's own words (prefer "explain/describe/why/what steps"), not yes/no. Simple English. One question only. Do NOT repeat: ${recent.length ? recent.map((q) => `"${q}"`).join("; ") : "(none)"}.
Respond with ONLY JSON: {"question":"..."}\n\n${ctx}`;
      const out = await callClaude(anthropicKey, sys, "Give me one question.");
      return json({ question: String(safeJson(out)?.question ?? out).trim() });
    }

    if (action === "grade") {
      const since = startOfTodayPkt();
      const { count } = await admin.from("tutor_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("role", "assistant").gte("created_at", since);
      if ((count ?? 0) >= DAILY_LIMIT)
        return json({ error: "You've done a lot of practice today. Come back tomorrow with a fresh mind." }, 429);

      const question = String(body?.question ?? "").trim();
      const answer = String(body?.answer ?? "").trim();
      if (!question || !answer) return json({ error: "Missing question or answer" }, 400);

      const sys = `You are Sihat Tutor, a kind but rigorous nursing examiner. Grade the student's answer using ONLY the chapter notes below as truth.
RULES: Never invent drug doses, lab values, or clinical guidelines; if the notes don't cover it, say so. Be encouraging and specific. Simple English.
"verdict": "strong" (essentially correct + complete), "partial" (right track, missing key points), or "weak" (mostly wrong/empty).
"correct": up to 3 short phrases of what they got right (may be empty). "missed": up to 3 key points missed/wrong (may be empty). "modelAnswer": a concise 2-4 sentence ideal answer from the notes.
Respond with ONLY JSON: {"verdict":"strong|partial|weak","correct":["..."],"missed":["..."],"modelAnswer":"..."}\n\n${ctx}`;
      const out = await callClaude(anthropicKey, sys, `QUESTION: ${question}\n\nSTUDENT ANSWER: ${answer}`);
      const p = safeJson(out) ?? {};
      const verdict = ["strong", "partial", "weak"].includes(p?.verdict) ? p.verdict : "partial";
      const correct = Array.isArray(p?.correct) ? p.correct.slice(0, 3).map(String) : [];
      const missed = Array.isArray(p?.missed) ? p.missed.slice(0, 3).map(String) : [];
      const modelAnswer = String(p?.modelAnswer ?? "").trim();

      try {
        await admin.from("tutor_messages").insert([
          { user_id: userId, chapter_id: chapterId, role: "user", content: `[practice] Q: ${question}\nA: ${answer}` },
          { user_id: userId, chapter_id: chapterId, role: "assistant", content: `[practice ${verdict}] ${modelAnswer}` },
        ]);
      } catch (_) { /* logging is non-blocking */ }

      return json({ verdict, correct, missed, modelAnswer });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("tutor-practice error", e);
    return json({ error: "Tutor is temporarily unavailable. Please try again." }, 500);
  }
});

async function callClaude(key: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 700, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) { console.error("anthropic", res.status, await res.text()); throw new Error("anthropic_failed"); }
  const j = await res.json();
  return (j?.content?.map((c: any) => c?.text ?? "").join("\n") ?? "").trim();
}
function safeJson(s: string): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
function startOfTodayPkt(): string {
  const pkt = new Date(Date.now() + 5 * 3600_000);
  pkt.setUTCHours(0, 0, 0, 0);
  return new Date(pkt.getTime() - 5 * 3600_000).toISOString();
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}
