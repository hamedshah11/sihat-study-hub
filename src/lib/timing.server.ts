import { AsyncLocalStorage } from "node:async_hooks";
import { setResponseHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { afterResponse } from "@/lib/request-scope.server";
import {
  callEnded,
  callStarted,
  newTracker,
  serverTimingHeader,
  timingFrom,
  timingLogLine,
  type ServerFnTiming,
  type SupabaseTracker,
} from "@/lib/timing";

// Times every server function (the global middleware in src/start.ts calls
// timeServerFn) and counts its Supabase requests. For each call it:
//   - adds a Server-Timing header (the phone's browser can read it back),
//   - logs one JSON line (function name and numbers only, no personal data),
//   - saves a row to public.server_timings after the response is sent, for
//     /admin/diagnostics. Until that table exists, saving is skipped.

const trackers = new AsyncLocalStorage<SupabaseTracker>();

// Supabase requests are counted by wrapping fetch: the Supabase clients are
// generated files (src/integrations/supabase/), and every client made after
// this module loads picks up the wrapper. Outside a timed call, or for any
// other host, it passes straight through.
function supabaseOrigin(): string | null {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;
  } catch {
    return null;
  }
}

function requestOrigin(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === "string") return new URL(input).origin;
    if (input instanceof URL) return input.origin;
    return new URL(input.url).origin;
  } catch {
    return null;
  }
}

const patched = Symbol.for("florence.timing.fetch");
const globals = globalThis as typeof globalThis & { [patched]?: boolean };
if (!globals[patched] && typeof globalThis.fetch === "function") {
  globals[patched] = true;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const tracker = trackers.getStore();
    const origin = tracker ? supabaseOrigin() : null;
    if (!tracker || !origin || requestOrigin(input) !== origin) return original(input, init);
    const depth = callStarted(tracker, performance.now());
    try {
      return await original(input, init);
    } finally {
      callEnded(tracker, depth, performance.now());
    }
  };
}

/** Keep timings this long; older rows are pruned now and then. */
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const PRUNE_CHANCE = 0.01;

let tableMissing = false;

const db = supabaseAdmin as unknown as {
  from: (table: string) => ReturnType<typeof supabaseAdmin.from>;
};

async function save(timing: ServerFnTiming) {
  if (tableMissing) return;
  const { error } = await db.from("server_timings").insert({
    fn: timing.fn.slice(0, 100),
    duration_ms: Math.round(timing.ms),
    supabase_calls: Math.min(timing.supabaseCalls, 32767),
    supabase_waits: Math.min(timing.supabaseWaits, 32767),
    ok: timing.ok,
  } as never);
  if (error) {
    // The migration that adds the table hasn't been applied yet.
    if (/server_timings|PGRST205|42P01/.test(`${error.code} ${error.message}`)) tableMissing = true;
    else console.warn("server timing not saved", error.message);
    return;
  }
  if (Math.random() < PRUNE_CHANCE) {
    await db
      .from("server_timings")
      .delete()
      .lt("created_at", new Date(Date.now() - KEEP_MS).toISOString());
  }
}

export async function timeServerFn<T>(fn: string, run: () => Promise<T>): Promise<T> {
  const tracker = newTracker();
  const started = performance.now();
  let ok = false;
  try {
    const result = await trackers.run(tracker, run);
    ok = !(result && typeof result === "object" && "error" in result && result.error);
    return result;
  } finally {
    const now = performance.now();
    const timing = timingFrom(fn, now - started, tracker, ok, now);
    try {
      setResponseHeader("Server-Timing", serverTimingHeader(timing));
    } catch {
      // No response to add it to (called outside a request).
    }
    console.log(timingLogLine(timing));
    afterResponse(save(timing));
  }
}
