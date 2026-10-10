// Test set-up and checks with the LOCAL service-role key. This file runs in
// Node (Playwright's runner and the seed script), never in the browser bundle,
// and e2eEnv() refuses any Supabase URL that isn't on this machine.

import { randomUUID } from "node:crypto";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { e2eEnv } from "./env.ts";
import { PASSWORD } from "./seed-data.ts";

let adminClient: SupabaseClient | undefined;

/** Service-role client for set-up and verification. Bypasses RLS. */
export function admin(): SupabaseClient {
  if (!adminClient) {
    const env = e2eEnv();
    adminClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** A browser-equivalent client: anon key plus, after sign-in, the user's session. */
export function anonClient(): SupabaseClient {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function must<T>(
  label: string,
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`[e2e] ${label}: ${error.message}`);
  return data;
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
};

/**
 * A fresh student for one test, so tests can run side by side without
 * sharing progress. Not in a batch unless one is given (a student without a
 * batch still sees Semester 1, the earliest semester with chapters).
 */
export async function createStudent(
  options: { name?: string; batchId?: string | null; role?: "student" | "instructor" } = {},
): Promise<TestUser> {
  const name = options.name ?? "Hira Khan";
  const email = `student-${randomUUID().slice(0, 8)}@florence.test`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error || !data.user) throw new Error(`[e2e] create student: ${error?.message}`);
  const id = data.user.id;
  await must(
    "set profile",
    admin()
      .from("profiles")
      .update({
        role: options.role ?? "student",
        batch_id: options.batchId ?? null,
        student_type: "internal",
      })
      .eq("id", id),
  );
  return { id, email, password: PASSWORD, name };
}

export async function deleteUser(id: string) {
  await admin().auth.admin.deleteUser(id);
}

/** Sign in as a user from Node, for seeding the browser and the RLS tests. */
export async function signIn(
  email: string,
  password = PASSWORD,
): Promise<{ client: SupabaseClient; session: Session }> {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`[e2e] sign in ${email}: ${error?.message}`);
  return { client, session: data.session };
}

// --- Progress fixtures ---------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const ago = (ms: number, now = Date.now()) => new Date(now - ms).toISOString();
export { HOUR, DAY };

/** A flashcard review row as FSRS leaves it after a couple of good reviews. */
export function reviewRow(
  userId: string,
  flashcardId: string,
  opts: { lastReviewAgo: number; dueIn: number; stability?: number; now?: number },
) {
  const now = opts.now ?? Date.now();
  const due = new Date(now + opts.dueIn);
  return {
    user_id: userId,
    flashcard_id: flashcardId,
    reps: 2,
    lapses: 0,
    state: "review",
    stability: opts.stability ?? 3,
    difficulty: 5,
    scheduled_days: Math.max(1, Math.round((opts.lastReviewAgo + opts.dueIn) / DAY)),
    elapsed_days: Math.round(opts.lastReviewAgo / DAY),
    learning_steps: 0,
    last_review: new Date(now - opts.lastReviewAgo).toISOString(),
    due_at: due.toISOString(),
    next_review_at: due.toISOString().slice(0, 10),
  };
}

/** Every progress table the browser must never write, for wiping a user's rows. */
export const PROGRESS_TABLES = [
  "xp_events",
  "streaks",
  "quiz_attempts",
  "chapter_progress",
  "flashcard_reviews",
  "tutor_messages",
  "exam_attempts",
  "question_answers",
] as const;

export async function wipeProgress(userId: string) {
  for (const table of [...PROGRESS_TABLES, "quiz_sessions", "user_badges", "content_reports"]) {
    await must(`wipe ${table}`, admin().from(table).delete().eq("user_id", userId));
  }
  await must("streak row", admin().from("streaks").insert({ user_id: userId }));
}
