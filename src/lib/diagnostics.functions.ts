import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Speed on /admin/diagnostics: how long each server function took over the
// last day, from the rows the timing middleware saves (timing.server.ts).
// Staff only. Function names and numbers only; nothing about students.

export type ServerFnSpeed = {
  fn: string;
  calls: number;
  failures: number;
  /** Median. */
  typicalMs: number;
  /** 95th percentile. */
  slowMs: number;
  slowestMs: number;
  supabaseCalls: number;
  supabaseWaits: number;
};

export type ServerSpeed =
  { available: false } | { available: true; since: string; functions: ServerFnSpeed[] };

const DAY_MS = 24 * 60 * 60 * 1000;

type SummaryRow = {
  fn: string;
  calls: number;
  failures: number;
  median_ms: number;
  p95_ms: number;
  max_ms: number;
  median_supabase_calls: number;
  median_supabase_waits: number;
};

// The function arrives with 20261010150000_server_timings.sql, after the
// generated types were made.
const rpc = supabaseAdmin as unknown as {
  rpc: (
    fn: "server_timing_summary",
    args: { p_since: string },
  ) => PromiseLike<{ data: SummaryRow[] | null; error: { code?: string; message: string } | null }>;
};

export const getServerSpeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ServerSpeed> => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (profile?.role !== "admin" && profile?.role !== "instructor") {
      throw new Error("Forbidden: staff only");
    }

    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { data, error } = await rpc.rpc("server_timing_summary", { p_since: since });
    if (error) {
      // The migration hasn't been applied yet.
      if (/server_timing|PGRST202|42883|42P01/.test(`${error.code} ${error.message}`)) {
        return { available: false };
      }
      throw new Error(error.message);
    }
    return {
      available: true,
      since,
      functions: (data ?? []).map((row) => ({
        fn: row.fn,
        calls: Number(row.calls),
        failures: Number(row.failures),
        typicalMs: Math.round(row.median_ms),
        slowMs: Math.round(row.p95_ms),
        slowestMs: row.max_ms,
        supabaseCalls: Math.round(row.median_supabase_calls),
        supabaseWaits: Math.round(row.median_supabase_waits),
      })),
    };
  });
