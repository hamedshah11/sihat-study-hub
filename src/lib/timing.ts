// Server-function timing: the pure parts, shared by the server (which
// measures) and the diagnostics screen (which reads the Server-Timing header
// back on the phone). No personal data: a function's name and numbers only.

/** Supabase activity during one server-function call. */
export type SupabaseTracker = {
  /** Requests made to Supabase (database, auth, storage, functions). */
  calls: number;
  /**
   * The longest chain of Supabase requests that ran one after another (each
   * starting after the one before it had finished). On a slow link each costs
   * a full round trip, so this, not `calls`, sets the delay.
   */
  waits: number;
  /** Longest chain among the requests that have finished so far. */
  finishedDepth: number;
  inFlight: number;
  busySince: number;
  /** Time with at least one Supabase request in flight. */
  busyMs: number;
};

export function newTracker(): SupabaseTracker {
  return { calls: 0, waits: 0, finishedDepth: 0, inFlight: 0, busySince: 0, busyMs: 0 };
}

/** A request starts; returns its place in the chain, for callEnded. */
export function callStarted(t: SupabaseTracker, now: number): number {
  const depth = t.finishedDepth + 1;
  t.calls += 1;
  t.waits = Math.max(t.waits, depth);
  if (t.inFlight === 0) t.busySince = now;
  t.inFlight += 1;
  return depth;
}

export function callEnded(t: SupabaseTracker, depth: number, now: number) {
  t.finishedDepth = Math.max(t.finishedDepth, depth);
  if (t.inFlight === 0) return;
  t.inFlight -= 1;
  if (t.inFlight === 0) t.busyMs += now - t.busySince;
}

export type ServerFnTiming = {
  fn: string;
  ms: number;
  supabaseCalls: number;
  supabaseWaits: number;
  supabaseMs: number;
  ok: boolean;
};

export function timingFrom(
  fn: string,
  ms: number,
  t: SupabaseTracker,
  ok: boolean,
  now = 0,
): ServerFnTiming {
  // A request still in flight (the function returned without awaiting it)
  // counts up to now.
  const busy = t.inFlight > 0 ? t.busyMs + (now - t.busySince) : t.busyMs;
  return {
    fn,
    ms: round(ms),
    supabaseCalls: t.calls,
    supabaseWaits: t.waits,
    supabaseMs: round(busy),
    ok,
  };
}

function round(ms: number) {
  return Math.max(0, Math.round(ms * 10) / 10);
}

/** Function names are code identifiers; anything else is dropped from headers. */
function safeName(fn: string) {
  return fn.replace(/[^A-Za-z0-9_$.-]/g, "").slice(0, 100) || "unknown";
}

/**
 * The Server-Timing header for one call, e.g.
 * `fn;desc="getProgressSnapshot";dur=182.4, supabase;desc="9 calls, 3 waits";dur=150.1`.
 * Browsers show it in the network panel and expose it to the page.
 */
export function serverTimingHeader(t: ServerFnTiming): string {
  return [
    `fn;desc="${safeName(t.fn)}";dur=${t.ms}`,
    `supabase;desc="${t.supabaseCalls} calls, ${t.supabaseWaits} waits";dur=${t.supabaseMs}`,
  ].join(", ");
}

/** One structured log line per call. */
export function timingLogLine(t: ServerFnTiming): string {
  return JSON.stringify({
    event: "server_fn",
    fn: safeName(t.fn),
    ms: t.ms,
    supabase_calls: t.supabaseCalls,
    supabase_waits: t.supabaseWaits,
    supabase_ms: t.supabaseMs,
    ok: t.ok,
  });
}

export type ParsedServerTiming = {
  fn: string;
  serverMs: number;
  supabaseCalls: number | null;
  supabaseWaits: number | null;
  supabaseMs: number | null;
};

/** Read our metrics back from a PerformanceResourceTiming's serverTiming list. */
export function parseServerTiming(
  entries: readonly { name: string; duration: number; description: string }[],
): ParsedServerTiming | null {
  const fn = entries.find((e) => e.name === "fn");
  if (!fn) return null;
  const sb = entries.find((e) => e.name === "supabase");
  const counts = sb?.description.match(/(\d+) calls?, (\d+) waits?/);
  return {
    fn: fn.description || "unknown",
    serverMs: fn.duration,
    supabaseCalls: counts ? Number(counts[1]) : null,
    supabaseWaits: counts ? Number(counts[2]) : null,
    supabaseMs: sb ? sb.duration : null,
  };
}

/** One server-function call as the phone saw it. */
export type PhoneCall = {
  fn: string;
  /** When the request started (milliseconds since 1970). */
  startedAt: number;
  /** From the request leaving to the response arriving, on the phone. */
  totalMs: number;
  /** Time spent in the server function (the rest is network and phone). */
  serverMs: number;
  supabaseWaits: number | null;
};

type ResourceEntry = {
  name: string;
  startTime: number;
  duration: number;
  serverTiming?: readonly { name: string; duration: number; description: string }[];
};

/**
 * Server-function calls among a page's resource timings, newest first.
 * `timeOrigin` is when the page opened (performance.timeOrigin).
 */
export function phoneCalls(entries: readonly ResourceEntry[], timeOrigin = 0): PhoneCall[] {
  const calls: PhoneCall[] = [];
  for (const entry of entries) {
    if (!entry.name.includes("/_serverFn/")) continue;
    const parsed = parseServerTiming(entry.serverTiming ?? []);
    if (!parsed) continue;
    calls.push({
      fn: parsed.fn,
      startedAt: Math.round(timeOrigin + entry.startTime),
      totalMs: Math.round(entry.duration),
      serverMs: Math.round(parsed.serverMs),
      supabaseWaits: parsed.supabaseWaits,
    });
  }
  return calls.sort((a, b) => b.startedAt - a.startedAt);
}

export type PhoneSummary = {
  fn: string;
  calls: number;
  /** Medians. */
  totalMs: number;
  serverMs: number;
  supabaseWaits: number | null;
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Typical (median) times per function, slowest first. */
export function summarisePhoneCalls(calls: PhoneCall[]): PhoneSummary[] {
  const byFn = new Map<string, PhoneCall[]>();
  for (const call of calls) byFn.set(call.fn, [...(byFn.get(call.fn) ?? []), call]);
  return [...byFn.entries()]
    .map(([fn, list]) => {
      const waits = list.map((c) => c.supabaseWaits).filter((w): w is number => w !== null);
      return {
        fn,
        calls: list.length,
        totalMs: median(list.map((c) => c.totalMs)),
        serverMs: median(list.map((c) => c.serverMs)),
        supabaseWaits: waits.length ? median(waits) : null,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);
}
