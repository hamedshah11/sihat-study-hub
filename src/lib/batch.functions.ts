import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { studyDay } from "@/lib/streak";
import { studyWeek } from "@/lib/progress-snapshot";

// The Batch tab. Progress is private by default: the batch screen shows
// class totals only (never a list of students, never a ranking), and the
// opt-in study circle shows only whether each friend studied today.
//
// Everything runs on the server with the service role because totals span
// other students' rows, which RLS (rightly) hides from the browser. Only
// aggregates and opted-in first names leave this file.

/** Start of a study day (4 am PKT) as an ISO timestamp. */
function studyDayStart(day: string) {
  return new Date(`${day}T04:00:00+05:00`).toISOString();
}

const db = supabaseAdmin as unknown as {
  from: (table: string) => ReturnType<typeof supabaseAdmin.from>;
};

export type CircleMember = { firstName: string; studiedToday: boolean | null; isMe: boolean };

export type BatchOverview = {
  batchName: string | null;
  programmeName: string | null;
  students: number;
  reviewsThisWeek: number;
  /** Subject the batch's average mastery is lowest in, once enough students have data. */
  hardestSubject: string | null;
  circle:
    | { available: false }
    | { available: true; code: string | null; members: CircleMember[]; showInCircles: boolean };
};

async function circleFor(userId: string): Promise<BatchOverview["circle"]> {
  const { data: membership, error } = await db
    .from("study_circle_members")
    .select("circle_id")
    .eq("user_id", userId)
    .maybeSingle();
  // Tables arrive with the Florence migration.
  if (error) return { available: false };
  const { data: settings } = await db
    .from("student_settings")
    .select("show_in_circles")
    .eq("user_id", userId)
    .maybeSingle();
  const showInCircles = Boolean((settings as { show_in_circles?: boolean } | null)?.show_in_circles);
  const circleId = (membership as { circle_id?: string } | null)?.circle_id;
  if (!circleId) return { available: true, code: null, members: [], showInCircles };

  const [{ data: circle }, { data: rows }] = await Promise.all([
    db.from("study_circles").select("code").eq("id", circleId).maybeSingle(),
    db.from("study_circle_members").select("user_id, joined_at").eq("circle_id", circleId).order("joined_at"),
  ]);
  const ids = ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const [{ data: profiles }, { data: visible }, { data: activity }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, display_name").in("id", ids),
    db.from("student_settings").select("user_id, show_in_circles").in("user_id", ids),
    supabaseAdmin
      .from("xp_events")
      .select("user_id")
      .in("user_id", ids)
      .gte("occurred_at", studyDayStart(studyDay())),
  ]);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, (p.display_name ?? "").trim().split(/\s+/)[0] || "Friend"]));
  const shows = new Set(
    ((visible ?? []) as { user_id: string; show_in_circles: boolean }[])
      .filter((v) => v.show_in_circles)
      .map((v) => v.user_id),
  );
  const studied = new Set((activity ?? []).map((a) => a.user_id));
  return {
    available: true,
    code: (circle as { code?: string } | null)?.code ?? null,
    showInCircles,
    // Joined order, never sorted by activity.
    members: ids.map((id) => ({
      firstName: nameOf.get(id) ?? "Friend",
      studiedToday: shows.has(id) ? studied.has(id) : null,
      isMe: id === userId,
    })),
  };
}

export const getBatchOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BatchOverview> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("batch_id")
      .eq("id", userId)
      .maybeSingle();
    const circle = await circleFor(userId);
    if (!profile?.batch_id) {
      return { batchName: null, programmeName: null, students: 0, reviewsThisWeek: 0, hardestSubject: null, circle };
    }

    const { data: batch } = await supabaseAdmin
      .from("batches")
      .select("name, program_id, current_semester_id")
      .eq("id", profile.batch_id)
      .maybeSingle();
    const { data: programme } = batch?.program_id
      ? await supabaseAdmin.from("programs").select("name").eq("id", batch.program_id).maybeSingle()
      : { data: null };

    const { data: classmates } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("batch_id", profile.batch_id)
      .eq("role", "student");
    const ids = (classmates ?? []).map((c) => c.id);

    const weekStart = studyDayStart(studyWeek(new Set())[0].date);
    const { count: reviews } = ids.length
      ? await supabaseAdmin
          .from("xp_events")
          .select("id", { count: "exact", head: true })
          .in("user_id", ids)
          .eq("source", "flashcard")
          .gte("occurred_at", weekStart)
      : { count: 0 };

    let hardestSubject: string | null = null;
    if (batch?.current_semester_id && ids.length >= 3) {
      const { data: subjects } = await supabaseAdmin
        .from("subjects")
        .select("id, name")
        .eq("semester_id", batch.current_semester_id);
      const subjectIds = (subjects ?? []).map((s) => s.id);
      const { data: chapters } = subjectIds.length
        ? await supabaseAdmin.from("chapters").select("id, subject_id").in("subject_id", subjectIds)
        : { data: [] };
      const subjectOf = new Map((chapters ?? []).map((c) => [c.id, c.subject_id]));
      const { data: progress } = subjectOf.size
        ? await supabaseAdmin
            .from("chapter_progress")
            .select("user_id, chapter_id, mastery_score")
            .in("user_id", ids)
            .in("chapter_id", [...subjectOf.keys()])
        : { data: [] };
      const bySubject = new Map<string, { sum: number; n: number; students: Set<string> }>();
      for (const p of progress ?? []) {
        const sid = subjectOf.get(p.chapter_id);
        if (!sid || p.mastery_score == null) continue;
        const agg = bySubject.get(sid) ?? { sum: 0, n: 0, students: new Set<string>() };
        agg.sum += Number(p.mastery_score);
        agg.n += 1;
        agg.students.add(p.user_id);
        bySubject.set(sid, agg);
      }
      const ranked = [...bySubject.entries()]
        .filter(([, a]) => a.students.size >= 3)
        .map(([sid, a]) => ({ sid, avg: a.sum / a.n }))
        .sort((a, b) => a.avg - b.avg);
      if (ranked.length >= 2) {
        hardestSubject = (subjects ?? []).find((s) => s.id === ranked[0].sid)?.name ?? null;
      }
    }

    return {
      batchName: batch?.name ?? null,
      programmeName: programme?.name ?? null,
      students: ids.length,
      reviewsThisWeek: reviews ?? 0,
      hardestSubject,
      circle,
    };
  });

// --- Study circles --------------------------------------------------------------

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

async function optIn(userId: string) {
  await db
    .from("student_settings")
    .upsert({ user_id: userId, show_in_circles: true, updated_at: new Date().toISOString() } as never, {
      onConflict: "user_id",
    });
}

export const createCircle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const { data: existing, error } = await db
      .from("study_circle_members")
      .select("circle_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false as const, reason: "unavailable" as const };
    if (existing) return { ok: false as const, reason: "already_in_circle" as const };
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: circle, error: insertError } = await db
        .from("study_circles")
        .insert({ code: newCode(), created_by: userId } as never)
        .select("id, code")
        .single();
      if (insertError) continue; // code collision: try another
      const c = circle as { id: string; code: string };
      const { error: joinError } = await db
        .from("study_circle_members")
        .insert({ circle_id: c.id, user_id: userId } as never);
      if (joinError) return { ok: false as const, reason: "unavailable" as const };
      await optIn(userId);
      return { ok: true as const, code: c.code };
    }
    return { ok: false as const, reason: "unavailable" as const };
  });

export const joinCircle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const { data: circle, error } = await db.from("study_circles").select("id").eq("code", data.code).maybeSingle();
    if (error) return { ok: false as const, reason: "unavailable" as const };
    if (!circle) return { ok: false as const, reason: "not_found" as const };
    const { error: joinError } = await db
      .from("study_circle_members")
      .insert({ circle_id: (circle as { id: string }).id, user_id: userId } as never);
    if (joinError) {
      if (joinError.message.includes("circle_full")) return { ok: false as const, reason: "full" as const };
      if (joinError.code === "23505") return { ok: false as const, reason: "already_in_circle" as const };
      return { ok: false as const, reason: "unavailable" as const };
    }
    await optIn(userId);
    return { ok: true as const };
  });

export const leaveCircle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const { data: membership } = await db
      .from("study_circle_members")
      .select("circle_id")
      .eq("user_id", userId)
      .maybeSingle();
    const circleId = (membership as { circle_id?: string } | null)?.circle_id;
    if (!circleId) return { ok: true as const };
    await db.from("study_circle_members").delete().eq("user_id", userId);
    // An empty circle is removed so its code stops working.
    const { count } = await db
      .from("study_circle_members")
      .select("user_id", { count: "exact", head: true })
      .eq("circle_id", circleId);
    if ((count ?? 0) === 0) await db.from("study_circles").delete().eq("id", circleId);
    return { ok: true as const };
  });
