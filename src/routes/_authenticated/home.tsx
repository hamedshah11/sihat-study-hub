import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Flame } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — Sihat" }] }),
  component: HomePage,
});

function HomePage() {
  const { data } = useQuery({
    queryKey: ["home-summary"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const [{ data: profile }, { data: streak }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        supabase.from("streaks").select("current_streak").eq("user_id", user.id).maybeSingle(),
      ]);
      return {
        name: profile?.display_name || "there",
        streak: streak?.current_streak ?? 0,
      };
    },
  });

  return (
    <div>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Hello,</p>
          <h1 className="text-2xl font-bold text-primary">{data?.name || "…"}</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5">
          <Flame className="size-4 text-accent" />
          <span className="text-sm font-semibold text-foreground">{data?.streak ?? 0}</span>
        </div>
      </header>

      <section className="mt-8 rounded-xl bg-surface p-6">
        <h2 className="text-xl font-bold text-primary">Welcome to Sihat</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Your study sessions will appear here once content is published.
        </p>
      </section>
    </div>
  );
}
