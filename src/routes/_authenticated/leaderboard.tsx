import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Sihat" }] }),
  component: LeaderboardPage,
});

type Row = { user_id: string; first_name: string | null; weekly_xp: number };

function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard-weekly"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: rows, error } = await supabase.rpc("batch_weekly_leaderboard");
      if (error) throw error;
      return { rows: (rows ?? []) as Row[], me: user?.id ?? null };
    },
  });

  return (
    <div>
      <Link to="/home" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Home
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <Trophy className="size-6 text-accent" />
        <h1 className="text-2xl font-bold text-primary">This week</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Top 20 in your batch · resets Monday</p>

      <div className="mt-6 rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
          </div>
        ) : !data?.rows.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No activity yet this week.</p>
        ) : (
          <ul className="divide-y">
            {data.rows.map((r, i) => {
              const isMe = r.user_id === data.me;
              return (
                <li
                  key={r.user_id}
                  className={`flex items-center gap-3 px-4 py-3 ${isMe ? "bg-accent/10" : ""}`}
                >
                  <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground">
                    {r.first_name ?? "—"} {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-primary">{r.weekly_xp} XP</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
