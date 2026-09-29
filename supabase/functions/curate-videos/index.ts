// Supabase Edge Function: curate-videos
// Staff-only (admin or instructor). Finds YouTube videos for chapters and
// stages them as status='draft' in chapter_resources for staff to approve.
//
// Modes (POST body):
//   { chapterId, query? }          search for one chapter (query overrides the default)
//   { subjectId }                  search every chapter in a subject, one after another
//   { chapterId, videoUrl }        staff pasted a specific video; checked and saved as approved
//
// Every candidate is checked through videos.list before it is stored:
// public, embeddable, not region-blocked in Pakistan, not live, and a sensible
// length. Rows that already exist for a chapter (any status) are never
// re-inserted, so a video faculty rejected cannot come back on a re-run.
//
// Quota: search.list costs 100 units, videos.list costs 1. One chapter is
// ~101 units, so all 66 Semester 1 chapters fit in the 10,000/day free quota.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YT = "https://www.googleapis.com/youtube/v3";

const SEARCH_RESULTS = 15; // candidates fetched per search (cost is flat at 100 units)
const KEEP_PER_CHAPTER = 5; // drafts staged per chapter per run
const MIN_SECONDS = 3 * 60; // drop Shorts and teasers
const MAX_SECONDS = 75 * 60; // drop multi-hour lecture dumps
const REGION = "PK";

// Words appended to the chapter title so the search lands on teaching
// content for the right discipline. Matched case-insensitively against the
// subject name; first match wins.
const SUBJECT_HINTS: Array<[RegExp, string]> = [
  [/anatomy|physiology/i, "anatomy and physiology"],
  [/microbiology/i, "microbiology nursing"],
  [/fundamentals of nursing/i, "nursing fundamentals"],
  [/biochemistry/i, "biochemistry"],
  [/ideology|constitution|pakistan/i, "Pakistan studies"],
  [/ict|information|computer/i, "computer basics"],
];

type Candidate = {
  externalId: string;
  title: string;
  channelTitle: string | null;
  channelId: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  thumbnailUrl: string | null;
  embeddable: boolean;
  regionBlocked: boolean;
  usable: boolean;
  reason: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ytKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!ytKey) return json({ error: "YOUTUBE_API_KEY is not set on this project." }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileErr) return json({ error: "Could not verify user role." }, 500);
    if (!profile || (profile.role !== "admin" && profile.role !== "instructor")) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const chapterId = String(body?.chapterId ?? "").trim();
    const subjectId = String(body?.subjectId ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();
    const queryOverride = String(body?.query ?? "")
      .trim()
      .slice(0, 200);

    // ---- Manual add -------------------------------------------------------
    if (videoUrl) {
      if (!UUID_RE.test(chapterId)) return json({ error: "Invalid chapterId" }, 400);
      const id = parseVideoId(videoUrl);
      if (!id) return json({ error: "That does not look like a YouTube video link." }, 400);
      const [c] = await hydrate([id], ytKey);
      if (!c) return json({ error: "Video not found, private, or deleted." }, 404);
      if (!c.embeddable)
        return json({ error: "The owner has disabled embedding for this video." }, 422);
      if (c.regionBlocked) return json({ error: "This video is blocked in Pakistan." }, 422);

      const { data: existing } = await admin
        .from("chapter_resources")
        .select("id, status")
        .eq("chapter_id", chapterId)
        .eq("provider", "youtube")
        .eq("external_id", id)
        .maybeSingle();
      if (existing) {
        // A deliberate paste by staff overrides an earlier rejection.
        await admin.from("chapter_resources").update({ status: "approved" }).eq("id", existing.id);
        return json({ mode: "manual", inserted: 0, reapproved: 1 });
      }
      const order = await nextOrder(admin, chapterId);
      const { error } = await admin
        .from("chapter_resources")
        .insert({ ...toRow(chapterId, c, order, null), source: "manual", status: "approved" });
      if (error) return json({ error: error.message }, 500);
      return json({ mode: "manual", inserted: 1, title: c.title });
    }

    // ---- Search: one chapter or a whole subject ---------------------------
    let chapters: Array<{ id: string; title: string; subject_id: string | null }> = [];
    if (UUID_RE.test(chapterId)) {
      const { data } = await admin
        .from("chapters")
        .select("id, title, subject_id")
        .eq("id", chapterId)
        .maybeSingle();
      if (!data) return json({ error: "Chapter not found" }, 404);
      chapters = [data];
    } else if (UUID_RE.test(subjectId)) {
      const { data } = await admin
        .from("chapters")
        .select("id, title, subject_id")
        .eq("subject_id", subjectId)
        .order("display_order", { ascending: true });
      chapters = data ?? [];
      if (chapters.length === 0) return json({ error: "No chapters in that subject" }, 404);
    } else {
      return json({ error: "Send chapterId or subjectId" }, 400);
    }

    const subjectIds = [...new Set(chapters.map((c) => c.subject_id).filter(Boolean))] as string[];
    const { data: subjects } = await admin.from("subjects").select("id, name").in("id", subjectIds);
    const subjectName = new Map<string, string>(
      (subjects ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
    );

    const results = [];
    for (const ch of chapters) {
      const query =
        chapters.length === 1 && queryOverride
          ? queryOverride
          : defaultQuery(ch.title, subjectName.get(ch.subject_id ?? "") ?? "");
      try {
        results.push(await curateChapter(admin, ch.id, ch.title, query, ytKey));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ chapter_id: ch.id, title: ch.title, query, error: msg });
        // A quota error will fail every remaining chapter too; stop early.
        if (/quota/i.test(msg)) break;
      }
    }

    return json({
      mode: chapters.length === 1 ? "chapter" : "subject",
      inserted: results.reduce((n, r) => n + (("inserted" in r && r.inserted) || 0), 0),
      chapters: results,
    });
  } catch (e) {
    console.error("curate-videos error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function curateChapter(
  admin: any,
  chapterId: string,
  title: string,
  query: string,
  key: string,
) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(SEARCH_RESULTS),
    videoEmbeddable: "true",
    safeSearch: "strict",
    regionCode: REGION,
    relevanceLanguage: "en",
    key,
  });
  const search = await ytGet(`${YT}/search?${params}`);
  const ids: string[] = (search.items ?? [])
    .map((i: { id?: { videoId?: string } }) => i.id?.videoId)
    .filter(Boolean);

  const { data: existingRows } = await admin
    .from("chapter_resources")
    .select("external_id")
    .eq("chapter_id", chapterId)
    .eq("provider", "youtube");
  const existing = new Set((existingRows ?? []).map((r: { external_id: string }) => r.external_id));
  const fresh = ids.filter((id) => !existing.has(id));

  const hydrated = fresh.length ? await hydrate(fresh, key) : [];
  const skipped = hydrated
    .filter((c) => !c.usable)
    .map((c) => ({ title: c.title, reason: c.reason }));
  // Keep YouTube's relevance order; hydrate() preserves the order of ids.
  const keep = hydrated.filter((c) => c.usable).slice(0, KEEP_PER_CHAPTER);

  let inserted = 0;
  if (keep.length) {
    const start = await nextOrder(admin, chapterId);
    const rows = keep.map((c, i) => toRow(chapterId, c, start + i, query));
    const { data, error } = await admin
      .from("chapter_resources")
      .upsert(rows, { onConflict: "chapter_id,provider,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    inserted = data?.length ?? 0;
  }

  return {
    chapter_id: chapterId,
    title,
    query,
    found: ids.length,
    already_present: ids.length - fresh.length,
    inserted,
    skipped,
  };
}

async function hydrate(ids: string[], key: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails,status,statistics",
    id: ids.join(","),
    key,
  });
  const res = await ytGet(`${YT}/videos?${params}`);
  // deno-lint-ignore no-explicit-any
  const byId = new Map<string, any>((res.items ?? []).map((v: any) => [v.id, v]));
  const out: Candidate[] = [];
  for (const id of ids) {
    const v = byId.get(id);
    if (!v) continue;
    const seconds = parseDuration(v.contentDetails?.duration ?? "");
    const rr = v.contentDetails?.regionRestriction ?? {};
    const regionBlocked =
      (Array.isArray(rr.blocked) && rr.blocked.includes(REGION)) ||
      (Array.isArray(rr.allowed) && !rr.allowed.includes(REGION));
    const embeddable = v.status?.embeddable === true;
    const isPublic = v.status?.privacyStatus === "public";
    const live = v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none";
    const forKids = v.status?.madeForKids === true; // comments/playback limited in embeds

    let reason: string | null = null;
    if (!isPublic) reason = "not public";
    else if (!embeddable) reason = "embedding disabled";
    else if (regionBlocked) reason = "blocked in Pakistan";
    else if (live) reason = "live or upcoming stream";
    else if (forKids) reason = "made for kids";
    else if (seconds !== null && seconds < MIN_SECONDS) reason = "too short";
    else if (seconds !== null && seconds > MAX_SECONDS) reason = "too long";

    const t = v.snippet?.thumbnails ?? {};
    out.push({
      externalId: id,
      title: String(v.snippet?.title ?? "Untitled"),
      channelTitle: v.snippet?.channelTitle ?? null,
      channelId: v.snippet?.channelId ?? null,
      durationSeconds: seconds,
      viewCount: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
      thumbnailUrl: (t.medium ?? t.high ?? t.default)?.url ?? null,
      embeddable,
      regionBlocked,
      usable: reason === null,
      reason,
    });
  }
  return out;
}

function toRow(chapterId: string, c: Candidate, order: number, query: string | null) {
  return {
    chapter_id: chapterId,
    provider: "youtube",
    kind: "video",
    external_id: c.externalId,
    title: decodeEntities(c.title),
    channel_title: c.channelTitle,
    channel_id: c.channelId,
    duration_seconds: c.durationSeconds,
    view_count: c.viewCount,
    thumbnail_url: c.thumbnailUrl,
    embeddable: c.embeddable,
    region_blocked: c.regionBlocked,
    source: "search",
    search_query: query,
    display_order: order,
    status: "draft",
    last_checked_at: new Date().toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
async function nextOrder(admin: any, chapterId: string): Promise<number> {
  const { data } = await admin
    .from("chapter_resources")
    .select("display_order")
    .eq("chapter_id", chapterId)
    .order("display_order", { ascending: false })
    .limit(1);
  return data?.[0] ? data[0].display_order + 1 : 0;
}

function defaultQuery(title: string, subject: string): string {
  const hint = SUBJECT_HINTS.find(([re]) => re.test(subject))?.[1] ?? subject;
  // Drop punctuation that confuses search ("Vital Signs I: Body Temperature").
  const clean = title
    .replace(/[:&()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${clean} ${hint}`.trim();
}

async function ytGet(url: string) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason ?? "";
    const msg = data?.error?.message ?? `YouTube API error ${res.status}`;
    throw new Error(reason.includes("quota") ? `YouTube quota exceeded: ${msg}` : msg);
  }
  return data;
}

function parseVideoId(input: string): string | null {
  const bare = /^[A-Za-z0-9_-]{11}$/;
  if (bare.test(input)) return input;
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be")
      return bare.test(u.pathname.slice(1, 12)) ? u.pathname.slice(1, 12) : null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && bare.test(v)) return v;
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

// ISO 8601 duration (PT1H2M3S) to seconds.
function parseDuration(iso: string): number | null {
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
