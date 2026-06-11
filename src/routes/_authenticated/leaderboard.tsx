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

  const rows = data?.rows ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div>
      <header className="animate-fade-up">
        <Link
          to="/home"
          className="inline-flex items-center gap-1 rounded-full border bg-card py-1.5 pl-2 pr-3.5 text-sm font-medium text-muted-foreground shadow-soft transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>
        <div className="mt-4 flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-primary text-primary-foreground shadow-glow">
            <Trophy className="size-5" />
          </span>
          <h1 className="font-display text-2xl font-bold text-primary">This week</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Top 20 in your batch · resets Monday</p>
      </header>

      {isLoading ? (
        <div className="mt-6 space-y-3 rounded-2xl border bg-card p-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
        </div>
      ) : !rows.length ? (
        <div className="animate-fade-up stagger-1 mt-6 rounded-2xl border bg-card p-8 text-center shadow-soft">
          <p className="text-sm text-muted-foreground">No activity yet this week.</p>
        </div>
      ) : (
        <>
          {/* Podium */}
          <div className="animate-fade-up stagger-1 mt-8 flex items-end justify-center gap-3">
            {[podium[1], podium[0], podium[2]].map((r, slot) => {
              if (!r) return <div key={slot} className="w-[88px]" />;
              const rank = slot === 1 ? 1 : slot === 0 ? 2 : 3;
              const isMe = r.user_id === data?.me;
              return (
                <div key={r.user_id} className="flex w-[96px] flex-col items-center">
                  <div
                    className={`grid place-items-center rounded-full font-display font-bold text-primary-foreground shadow-lifted ${
                      rank === 1
                        ? "size-16 bg-gradient-to-br from-amber-400 to-amber-600 text-xl"
                        : rank === 2
                          ? "size-13 bg-gradient-to-br from-slate-300 to-slate-500 text-lg"
                          : "size-13 bg-gradient-to-br from-orange-300 to-orange-500 text-lg"
                    } ${isMe ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}
                  >
                    {(r.first_name ?? "—").charAt(0).toUpperCase()}
                  </div>
                  <p className="mt-2 w-full truncate text-center text-xs font-semibold text-foreground">
                    {r.first_name ?? "—"}{isMe ? " (you)" : ""}
                  </p>
                  <p className="text-[11px] font-medium text-accent tabular-nums">{r.weekly_xp} XP</p>
                  <div
                    className={`mt-2 w-full rounded-t-xl border border-b-0 ${
                      rank === 1
                        ? "h-20 bg-gradient-to-b from-amber-100 to-card border-amber-200"
                        : rank === 2
                          ? "h-13 bg-gradient-to-b from-slate-100 to-card border-slate-200"
                          : "h-9 bg-gradient-to-b from-orange-100 to-card border-orange-200"
                    } grid place-items-start justify-center pt-2`}
                  >
                    <span className="font-display text-lg font-bold text-muted-foreground/60">{rank}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rest of the list */}
          {rest.length > 0 && (
            <div className="animate-fade-up stagger-2 -mt-px overflow-hidden rounded-2xl border bg-card shadow-soft">
              <ul className="divide-y">
                {rest.map((r, i) => {
                  const isMe = r.user_id === data?.me;
                  return (
                    <li
                      key={r.user_id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${isMe ? "bg-accent/10" : "hover:bg-secondary/60"}`}
                    >
                      <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                        {i + 4}
                      </span>
                      <span className="flex-1 text-sm font-medium text-foreground">
                        {r.first_name ?? "—"} {isMe && <span className="text-xs font-semibold text-accent">(you)</span>}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-primary">{r.weekly_xp} XP</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
