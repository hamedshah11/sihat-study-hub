// Where the end-to-end tests find the local Supabase stack, and the guard that
// keeps them away from the hosted project.
//
// The tests only ever talk to the stack started by `supabase start` on this
// machine. The keys come from `supabase status` (or E2E_* variables, which CI
// sets from the same command). Anything that isn't a loopback address is
// refused before a single request is made, so a stray .env can't point the
// suite at production data.

import { execFileSync } from "node:child_process";

export type E2EEnv = {
  /** e.g. http://127.0.0.1:54321 */
  supabaseUrl: string;
  /** The local anon key: what the browser bundle uses. */
  anonKey: string;
  /** The local service-role key: test set-up and checks only, never the browser. */
  serviceRoleKey: string;
  /** Mailpit, the local mail catcher. */
  mailUrl: string;
  /** Where the built app is served during the tests. */
  appUrl: string;
};

/**
 * The Supabase CLI, pinned: its version decides which service images the
 * local stack runs. Run through npx, so nothing is added to package.json.
 */
export const SUPABASE_CLI = ["--yes", "supabase@2.120.0"];

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** The hosted project's id, from supabase/config.toml. Never allowed in a test URL. */
export const HOSTED_PROJECT_ID = "xiuofoymjrashpxvuose";

export function assertLocal(name: string, url: string) {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`[e2e] ${name} is not a URL: ${url}`);
  }
  if (!LOOPBACK.has(host) || url.includes(HOSTED_PROJECT_ID) || /supabase\.co/i.test(url)) {
    throw new Error(
      `[e2e] ${name} must point at the local Supabase stack (127.0.0.1), not ${url}. ` +
        "The end-to-end tests never touch the hosted project.",
    );
  }
}

function fromStatus(): Record<string, string> {
  let out: string;
  try {
    out = execFileSync("npx", [...SUPABASE_CLI, "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch (error) {
    throw new Error(
      "[e2e] The local Supabase stack isn't running. Start it with `npm run e2e:supabase` " +
        `(needs Docker), then run the tests again.\n${String(error)}`,
    );
  }
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  return JSON.parse(json) as Record<string, string>;
}

let cached: E2EEnv | undefined;

export function e2eEnv(): E2EEnv {
  if (cached) return cached;
  let supabaseUrl = process.env.E2E_SUPABASE_URL;
  let anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  let serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  let mailUrl = process.env.E2E_MAIL_URL;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    const status = fromStatus();
    supabaseUrl = status.API_URL;
    anonKey = status.ANON_KEY;
    serviceRoleKey = status.SERVICE_ROLE_KEY;
    mailUrl = status.MAILPIT_URL ?? status.INBUCKET_URL;
  }
  const env: E2EEnv = {
    supabaseUrl: supabaseUrl!,
    anonKey: anonKey!,
    serviceRoleKey: serviceRoleKey!,
    mailUrl: mailUrl ?? "http://127.0.0.1:54324",
    appUrl: process.env.E2E_APP_URL ?? "http://127.0.0.1:3000",
  };
  assertLocal("Supabase URL", env.supabaseUrl);
  assertLocal("Mail URL", env.mailUrl);
  assertLocal("App URL", env.appUrl);
  // Hand the values to Playwright's workers and web servers without asking
  // the CLI again.
  process.env.E2E_SUPABASE_URL = env.supabaseUrl;
  process.env.E2E_SUPABASE_ANON_KEY = env.anonKey;
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
  process.env.E2E_MAIL_URL = env.mailUrl;
  cached = env;
  return env;
}
