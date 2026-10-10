import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lockup } from "@/components/brand/Lockup";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: BRAND.storeName },
      {
        name: "description",
        content:
          "Short daily reviews for BSN nursing students: flashcards, MCQs and summaries checked by your college's teachers. Powered by SIHAT.",
      },
      { property: "og:title", content: BRAND.storeName },
      { property: "og:description", content: BRAND.tagline },
    ],
  }),
  component: Welcome,
});

/**
 * Splash and welcome in one: the stacked lockup on Night ward with a
 * lamplight glow, then the batch code first. Students who've already joined
 * sign in with their email, so no college email is needed.
 */
function Welcome() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <section className="dark relative flex min-h-[52dvh] flex-col items-center justify-center overflow-hidden bg-night px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] text-linen">
        <div aria-hidden className="lamp-glow absolute inset-0" />
        <Lockup
          layout="stacked"
          height={30}
          variant="night"
          className="animate-scale-in relative"
        />
        <p className="relative mt-6 text-[13.5px] text-mist">{BRAND.tagline}</p>
      </section>

      <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
        <h1 className="animate-fade-up font-display text-[32px] leading-[1.08]">
          Welcome to Florence.
        </h1>
        <p className="animate-fade-up stagger-1 mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Short daily reviews for your BSN subjects, checked by your college's teachers.
        </p>
        <div className="animate-fade-up stagger-2 mt-auto pt-8">
          <Link
            to="/signup"
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            I have a batch code
          </Link>
          <p className="mt-2.5 text-center text-[13px] text-muted-foreground">
            Your class coordinator gives you this code. No college email needed.
          </p>
          <div className="my-5 flex items-center gap-3 text-[12.5px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> Already joined?{" "}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Link
            to="/login"
            className="flex h-[50px] w-full items-center justify-center rounded-full border border-border-strong text-[15px] font-semibold"
          >
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
