import { execFileSync } from "node:child_process";

// Where the end-to-end tests find the local Supabase stack. The keys come from
// `supabase status` (the CLI's own local keys), never from .env, which points
// at production. Anything that is not on this machine is refused.

/** Pinned so local runs and CI use the same Supabase CLI and images. */
export const SUPABASE_CLI = "supabase@2.120.0";

/** The built app, served locally by `wrangler dev` (see e2e/scripts/serve.mjs). */
export const APP_PORT = 8788;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

/** The stand-in for the Anthropic API that tutor-ask calls during tests. */
export const ANTHROPIC_STUB_PORT = 54399;

/** Local Supabase's mail catcher. */
export const MAILPIT_URL = "http://127.0.0.1:54324";

export type LocalSupabase = { url: string; anonKey: string; serviceRoleKey: string };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function assertLocalUrl(url: string, what: string) {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${what} is not a URL: ${url}`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${what} must be a local address, not ${host}. The end-to-end tests only ever use the local Supabase stack.`,
    );
  }
}

function readStatus(): LocalSupabase {
  let out: string;
  try {
    out = execFileSync("npx", ["--yes", SUPABASE_CLI, "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "Local Supabase isn't running. Start it with `npm run e2e:supabase` (Docker needed), then run the tests again.",
    );
  }
  const env = new Map<string, string>();
  for (const line of out.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env.set(m[1], m[2]);
  }
  const url = env.get("API_URL");
  const anonKey = env.get("ANON_KEY");
  const serviceRoleKey = env.get("SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("`supabase status` didn't report the local API URL and keys.");
  }
  return { url, anonKey, serviceRoleKey };
}

/**
 * The local stack's URL and keys. Read once (in the Playwright config) and
 * passed to workers through E2E_* environment variables.
 */
export function localSupabase(): LocalSupabase {
  if (!process.env.E2E_SUPABASE_URL) {
    const status = readStatus();
    process.env.E2E_SUPABASE_URL = status.url;
    process.env.E2E_SUPABASE_ANON_KEY = status.anonKey;
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = status.serviceRoleKey;
  }
  const local = {
    url: process.env.E2E_SUPABASE_URL!,
    anonKey: process.env.E2E_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
  };
  assertLocalUrl(local.url, "The Supabase URL");
  return local;
}
