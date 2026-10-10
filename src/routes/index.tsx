import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Endorsement, Lockup, Wordmark } from "@/components/brand/Lockup";
import { FlorenceMark } from "@/components/brand/FlorenceMark";
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

const SPLASH_SEEN = "florence:splash-seen";

/** The splash: the stacked lockup on Night ward with a lamplight glow. */
function Splash() {
  return (
    <div className="dark fixed inset-0 z-50 flex flex-col items-center bg-night text-linen">
      <div aria-hidden className="lamp-glow absolute inset-0" />
      <div className="relative flex flex-1 items-center">
        <Lockup layout="stacked" height={32} variant="night" className="animate-scale-in" />
      </div>
      <p className="relative pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[15px] text-linen/85">
        BSN study for Semester 1
      </p>
    </div>
  );
}

/**
 * Welcome, all on Night ward: the batch code comes first. Students who have already joined sign
 * in with a phone number or email, so no college email is needed.
 */
function Welcome() {
  const navigate = useNavigate();
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SPLASH_SEEN) === "1";
      sessionStorage.setItem(SPLASH_SEEN, "1");
    } catch {
      // No storage: show the splash briefly anyway.
    }
    const timer = window.setTimeout(() => setSplash(false), seen ? 0 : 1300);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="dark relative min-h-dvh bg-night text-linen">
      {splash && <Splash />}
      <div aria-hidden className="lamp-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex h-12 items-center gap-2" aria-label="Florence">
          <FlorenceMark size={24} />
          <Wordmark className="text-[22px]" />
        </div>
        <h1 className="mt-14 font-display text-[34px] leading-[1.08]">Welcome to Florence.</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
          Short daily reviews for your BSN subjects, checked by your college's teachers.
        </p>
        <Link
          to="/signup"
          className="mt-8 flex h-[54px] w-full items-center justify-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground"
        >
          I have a batch code
        </Link>
        <p className="mt-3 text-center text-[14px] leading-snug text-muted-foreground">
          Your class coordinator gives you this code. No college email needed.
        </p>
        <div className="my-5 flex items-center gap-3 text-[14px] text-muted-foreground">
          <span className="h-px flex-1 bg-border-strong/25" /> Already joined?
          <span className="h-px flex-1 bg-border-strong/25" />
        </div>
        <Link
          to="/login"
          className="flex h-[54px] w-full items-center justify-center rounded-full border border-border-strong/70 text-[16px] font-semibold"
        >
          Sign in with phone or email
        </Link>
        <div className="mt-auto flex justify-center pt-10">
          <Endorsement tone="night" className="!text-[11px]" />
        </div>
      </div>
    </div>
  );
}
