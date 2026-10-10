import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSupabase } from "./env.ts";

// Trusted access to the LOCAL test database for seeding, resetting a student
// before a test and checking what the server wrote. Node-side test code only:
// the local service-role key never reaches a browser page.

let admin: SupabaseClient | undefined;

export function adminClient(): SupabaseClient {
  if (!admin) {
    const { url, serviceRoleKey } = localSupabase();
    admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

/** A signed-in client exactly like the app's browser client: anon key plus the student's session. */
export async function studentClient(email: string, password: string): Promise<SupabaseClient> {
  const { url, anonKey } = localSupabase();
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Couldn't sign in ${email}: ${error.message}`);
  return client;
}

/** Throw with the table name if a trusted write fails. */
export async function must<T>(
  label: string,
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
