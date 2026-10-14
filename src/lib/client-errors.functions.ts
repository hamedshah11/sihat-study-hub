import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ERROR_LOG_DAYS } from "@/lib/privacy";

// What went wrong on students' phones. The browser sends errors here
// (src/lib/error-reporting.ts); staff read them grouped on /admin/diagnostics.
// The table (client_errors, 20261014090000_pilot_readiness.sql) is service
// role only. Reporting works signed out too (sign-in screens break as well);
// a signed-in reporter is identified from the verified token, never the body.

const Input = z.object({
  kind: z.enum(["render", "error", "unhandled"]),
  message: z.string().trim().min(1).max(1000),
  stack: z.string().max(4000).optional(),
  path: z.string().max(300).optional(),
  userAgent: z.string().max(300).optional(),
  appVersion: z.string().max(40).optional(),
});

const PER_USER_PER_HOUR = 30;
const SIGNED_OUT_PER_HOUR = 200;

const db = supabaseAdmin as unknown as {
  from: (t: string) => ReturnType<typeof supabaseAdmin.from>;
};

async function reporterId(): Promise<string | null> {
  const auth = getRequest()?.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const { data } = await supabaseAdmin.auth.getUser(token);
  return data.user?.id ?? null;
}

export const reportClientError = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    try {
      const userId = await reporterId();
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      let count = db
        .from("client_errors")
        .select("id", { count: "exact", head: true })
        .gte("created_at", hourAgo);
      count = userId ? count.eq("user_id", userId) : count.is("user_id", null);
      const { count: recent, error: countError } = await count;
      if (countError) return { ok: false as const };
      if ((recent ?? 0) >= (userId ? PER_USER_PER_HOUR : SIGNED_OUT_PER_HOUR)) {
        return { ok: false as const };
      }

      await db.from("client_errors").insert({
        user_id: userId,
        kind: data.kind,
        message: data.message,
        stack: data.stack || null,
        path: data.path || null,
        user_agent: data.userAgent || null,
        app_version: data.appVersion || null,
      } as never);

      // Housekeeping now and then, so the table stays small.
      if (Math.random() < 0.05) {
        const cutoff = new Date(Date.now() - ERROR_LOG_DAYS * 86_400_000).toISOString();
        await db.from("client_errors").delete().lt("created_at", cutoff);
      }
      return { ok: true as const };
    } catch {
      // Reporting must never cause an error of its own.
      return { ok: false as const };
    }
  });

export type ClientErrorGroup = {
  message: string;
  path: string | null;
  kind: string;
  count: number;
  people: number;
  lastSeen: string;
  stack: string | null;
  userAgent: string | null;
};

export type ClientErrors =
  | { available: false }
  | { available: true; total: number; groups: ClientErrorGroup[] };

type Row = {
  message: string;
  path: string | null;
  kind: string;
  user_id: string | null;
  created_at: string;
  stack: string | null;
  user_agent: string | null;
};

/** Staff only: the last 7 days of errors, grouped by message and page. */
export const getClientErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientErrors> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.role !== "admin" && profile?.role !== "instructor") {
      throw new Error("Forbidden: staff only");
    }

    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error } = await db
      .from("client_errors")
      .select("message, path, kind, user_id, created_at, stack, user_agent")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) return { available: false };

    const rows = (data ?? []) as Row[];
    const groups = new Map<string, ClientErrorGroup & { users: Set<string> }>();
    for (const r of rows) {
      // Ids in paths (/chapters/<uuid>) would split one bug into many groups.
      const path = r.path?.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id") ?? null;
      const key = `${r.message}\u0000${path}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          message: r.message,
          path,
          kind: r.kind,
          count: 0,
          people: 0,
          lastSeen: r.created_at,
          stack: r.stack,
          userAgent: r.user_agent,
          users: new Set(),
        };
        groups.set(key, g);
      }
      g.count += 1;
      if (r.user_id) g.users.add(r.user_id);
    }
    return {
      available: true,
      total: rows.length,
      groups: [...groups.values()]
        .map(({ users, ...g }) => ({ ...g, people: users.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50),
    };
  });
