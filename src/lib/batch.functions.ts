import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { studyDay } from "@/lib/streak";
import { studyWeek } from "@/lib/progress-snapshot";
import { circleMembersFrom, hardestSubjectFrom, type CircleMember } from "@/lib/batch-overview";

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

export type { CircleMember };

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

type CircleRow = {
  circle_id: string;
  study_circles: { code: string; study_circle_members: { user_id: string }[] } | null;
};

// The student's circle (its code and members in joined order, in one read)
// and their own setting load together; then the members' names, settings
// and today's activity load together.
async function circleFor(userId: string): Promise<BatchOverview["circle"]> {
  const [{ data: membership, error }, { data: settings }] = await Promise.all([
    db
      .from("study_circle_members")
      .select("circle_id, study_circles(code, study_circle_members(user_id, joined_at))")
      .eq("user_id", userId)
      .order("joined_at", { referencedTable: "study_circles.study_circle_members" })
      .maybeSingle(),
    db.from("student_settings").select("show_in_circles").eq("user_id", userId).maybeSingle(),
  ]);
  // Tables arrive with the Florence migration.
  if (error) return { available: false };
  const showInCircles = Boolean(
    (settings as { show_in_circles?: boolean } | null)?.show_in_circles,
  );
  const row = membership as CircleRow | null;
  if (!row?.circle_id) return { available: true, code: null, members: [], showInCircles };

  const ids = (row.study_circles?.study_circle_members ?? []).map((r) => r.user_id);
  const [{ data: profiles }, { data: visible }, { data: activity }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, display_name").in("id", ids),
    db.from("student_settings").select("user_id, show_in_circles").in("user_id", ids),
    supabaseAdmin
      .from("xp_events")
      .select("user_id")
      .in("user_id", ids)
      .gte("occurred_at", studyDayStart(studyDay())),
  ]);
  return {
    available: true,
    code: row.study_circles?.code ?? null,
    showInCircles,
    members: circleMembersFrom(
      ids,
      userId,
      profiles ?? [],
      (visible ?? []) as { user_id: string; show_in_circles: boolean }[],
      (activity ?? []).map((a) => a.user_id),
    ),
  };
}

// The student's batch, programme, classmates and the current semester's
// subjects and chapters, in one read.
const BATCH_AND_CLASSMATES = `batch_id, batches(
  name, current_semester_id, programs(name), profiles(id),
  semesters(subjects(id, name, chapters(id, subject_id)))
)`.replace(/\s+/g, "");

type BatchRow = {
  batch_id: string | null;
  batches: {
    name: string;
    current_semester_id: string | null;
    programs: { name: string } | null;
    profiles: { id: string }[];
    semesters: {
      subjects: { id: string; name: string; chapters: { id: string; subject_id: string }[] }[];
    } | null;
  } | null;
};

type BatchTotals = Omit<BatchOverview, "circle">;

async function batchTotals(userId: string): Promise<BatchTotals> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(BATCH_AND_CLASSMATES)
    .eq("id", userId)
    .eq("batches.profiles.role", "student")
    .maybeSingle();
  const profile = data as unknown as BatchRow | null;
  if (!profile?.batch_id) {
    return {
      batchName: null,
      programmeName: null,
      students: 0,
      reviewsThisWeek: 0,
      hardestSubject: null,
    };
  }

  const batch = profile.batches;
  const ids = (batch?.profiles ?? []).map((c) => c.id);
  const subjects = batch?.semesters?.subjects ?? [];
  const chapters = subjects.flatMap((s) => s.chapters);
  const compareSubjects = Boolean(batch?.current_semester_id) && ids.length >= 3;

  const weekStart = studyDayStart(studyWeek(new Set())[0].date);
  const [{ count: reviews }, { data: progress }] = await Promise.all([
    ids.length
      ? supabaseAdmin
          .from("xp_events")
          .select("id", { count: "exact", head: true })
          .in("user_id", ids)
          .eq("source", "flashcard")
          .gte("occurred_at", weekStart)
      : { count: 0 },
    compareSubjects && chapters.length
      ? supabaseAdmin
          .from("chapter_progress")
          .select("user_id, chapter_id, mastery_score")
          .in("user_id", ids)
          .in(
            "chapter_id",
            chapters.map((c) => c.id),
          )
      : { data: [] },
  ]);

  return {
    batchName: batch?.name ?? null,
    programmeName: batch?.programs?.name ?? null,
    students: ids.length,
    reviewsThisWeek: reviews ?? 0,
    hardestSubject: compareSubjects ? hardestSubjectFrom(subjects, chapters, progress ?? []) : null,
  };
}

// The circle and the batch totals don't depend on each other, so they load
// at the same time.
export const getBatchOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BatchOverview> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const [totals, circle] = await Promise.all([batchTotals(userId), circleFor(userId)]);
    return { ...totals, circle };
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
    .upsert(
      { user_id: userId, show_in_circles: true, updated_at: new Date().toISOString() } as never,
      {
        onConflict: "user_id",
      },
    );
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
    z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{6}$/),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const { data: circle, error } = await db
      .from("study_circles")
      .select("id")
      .eq("code", data.code)
      .maybeSingle();
    if (error) return { ok: false as const, reason: "unavailable" as const };
    if (!circle) return { ok: false as const, reason: "not_found" as const };
    const { error: joinError } = await db
      .from("study_circle_members")
      .insert({ circle_id: (circle as { id: string }).id, user_id: userId } as never);
    if (joinError) {
      if (joinError.message.includes("circle_full"))
        return { ok: false as const, reason: "full" as const };
      if (joinError.code === "23505")
        return { ok: false as const, reason: "already_in_circle" as const };
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
