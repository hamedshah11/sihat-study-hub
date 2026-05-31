// Supabase Edge Function: generate-content
// Admin/instructor-only. Generates a chapter summary, 30 MCQs, and 50 flashcards
// from source material using Anthropic Claude, and saves them as drafts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { shuffleOptions } from "../_shared/shuffle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json({ error: "Content generation is not configured." }, 500);

    // Auth-scoped client to identify the user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Admin client for trusted reads/writes.
    const admin = createClient(supabaseUrl, serviceKey);

    // Role check
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

    // Validate body
    const body = await req.json().catch(() => ({}));
    const chapterId = String(body?.chapterId ?? "").trim();
    const sourceMaterial = String(body?.sourceMaterial ?? "");
    if (!chapterId || !UUID_RE.test(chapterId)) {
      return json({ error: "Invalid chapterId" }, 400);
    }
    if (!sourceMaterial || sourceMaterial.length < 1 || sourceMaterial.length > 50_000) {
      return json({ error: "sourceMaterial must be between 1 and 50,000 characters" }, 400);
    }

    // Verify chapter exists
    const { data: chapter, error: chErr } = await admin
      .from("chapters")
      .select("id, title")
      .eq("id", chapterId)
      .maybeSingle();
    if (chErr || !chapter) return json({ error: "Chapter not found" }, 404);

    const summarySystem = `You are an expert nursing educator. Convert the provided source material into clean Markdown study notes for nursing students in Pakistan.

RULES:
- Use H2 (##) headings to organize topics.
- Short paragraphs and concise bullet points.
- Plain, simple English suitable for nursing students.
- Do NOT invent facts, drug doses, lab values, or guidelines not present in the source.
- End the notes with a final section titled exactly: "## Why this matters for nursing" with 3-5 bullets connecting the content to nursing practice.
- Output ONLY the Markdown. No preamble, no code fences.`;

    const questionsSystem = `You are an expert nursing exam writer. From the provided source material, write EXACTLY 30 multiple-choice questions for nursing students.

Distribution: 10 easy, 15 medium, 5 hard.

Each question MUST be a JSON object with this exact shape:
{
  "prompt": "string",
  "options": ["string", "string", "string", "string"],
  "correct_index": 0,
  "explanation": "1-2 sentence explanation",
  "difficulty": "easy" | "medium" | "hard"
}

RULES:
- Exactly 4 options per question.
- correct_index is an integer 0-3.
- Base every question strictly on the source material. Do not invent facts.
- Output ONLY a JSON array of 30 question objects. No markdown fences, no commentary.`;

    const flashcardsSystem = `You are an expert nursing educator creating spaced-repetition flashcards. From the provided source material, write EXACTLY 50 flashcards.

Each flashcard MUST be a JSON object with this exact shape:
{
  "front": "short prompt or question",
  "back": "1-3 sentence answer",
  "hint": "optional short hint" | null
}

RULES:
- Keep the front short and focused on one idea.
- Keep the back to 1-3 sentences.
- Base every card strictly on the source material. Do not invent facts.
- Output ONLY a JSON array of 50 flashcard objects. No markdown fences, no commentary.`;

    const userContent = `Chapter title: ${chapter.title}\n\nSOURCE MATERIAL:\n"""\n${sourceMaterial}\n"""`;

    const [summaryRes, questionsRes, flashcardsRes] = await Promise.all([
      callAnthropic(anthropicKey, summarySystem, userContent, 2000),
      callAnthropic(anthropicKey, questionsSystem, userContent, 4000),
      callAnthropic(anthropicKey, flashcardsSystem, userContent, 4000),
    ]);

    if (!summaryRes.ok || !questionsRes.ok || !flashcardsRes.ok) {
      console.error("Anthropic errors", {
        summary: summaryRes.error,
        questions: questionsRes.error,
        flashcards: flashcardsRes.error,
      });
      return json({ error: "AI generation failed. Please try again." }, 502);
    }

    const summaryMd = summaryRes.text.trim();
    const questionsRaw = parseJsonArray(questionsRes.text);
    const flashcardsRaw = parseJsonArray(flashcardsRes.text);

    // Save summary
    const { error: updateErr } = await admin
      .from("chapters")
      .update({ summary_md: summaryMd })
      .eq("id", chapterId);
    if (updateErr) {
      console.error("chapter update error", updateErr);
      return json({ error: "Failed to save chapter summary." }, 500);
    }

    // Sanitize & insert questions
    const questionRows = questionsRaw
      .map((q: any) => {
        const opts = Array.isArray(q?.options) ? q.options.map((o: any) => String(o)) : [];
        const ci = Number(q?.correct_index);
        const diff = String(q?.difficulty ?? "medium");
        if (!q?.prompt || opts.length !== 4 || !Number.isInteger(ci) || ci < 0 || ci > 3) {
          return null;
        }
        // Fisher-Yates shuffle so the correct answer is evenly distributed
        // across positions regardless of model bias.
        const correctValue = opts[ci];
        const shuffled = opts.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const newCorrectIndex = shuffled.indexOf(correctValue);
        return {
          chapter_id: chapterId,
          status: "draft",
          prompt: String(q.prompt),
          options: shuffled,
          correct_index: newCorrectIndex,
          explanation: q?.explanation ? String(q.explanation) : null,
          difficulty: ["easy", "medium", "hard"].includes(diff) ? diff : "medium",
        };

      })
      .filter(Boolean);

    if (questionRows.length > 0) {
      const { error: qErr } = await admin.from("questions").insert(questionRows as any);
      if (qErr) console.error("questions insert error", qErr);
    }

    // Sanitize & insert flashcards
    const flashcardRows = flashcardsRaw
      .map((c: any) => {
        if (!c?.front || !c?.back) return null;
        return {
          chapter_id: chapterId,
          status: "draft",
          card_type: "basic",
          front: String(c.front),
          back: String(c.back),
          hint: c?.hint == null ? null : String(c.hint),
        };
      })
      .filter(Boolean);

    if (flashcardRows.length > 0) {
      const { error: fErr } = await admin.from("flashcards").insert(flashcardRows as any);
      if (fErr) console.error("flashcards insert error", fErr);
    }

    return json({
      ok: true,
      counts: {
        questions: questionRows.length,
        flashcards: flashcardRows.length,
      },
    });
  } catch (e) {
    console.error("generate-content error", e);
    return json({ error: "Something went wrong." }, 500);
  }
});

async function callAnthropic(
  apiKey: string,
  system: string,
  userContent: string,
  maxTokens: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `${res.status} ${errText}` };
    }
    const data = await res.json();
    const text: string =
      data?.content?.map((c: any) => c?.text ?? "").join("\n") ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function parseJsonArray(text: string): any[] {
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    const slice = text.slice(start, end + 1);
    const parsed = JSON.parse(slice);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
