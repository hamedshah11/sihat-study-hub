import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ProgressRose, type RosePetal } from "@/components/brand/ProgressRose";
import { useProgress } from "@/lib/progress-data";
import { pageTitle } from "@/lib/brand";
import { estimateMinutes } from "@/lib/mastery";

export const Route = createFileRoute("/_authenticated/intro")({
  head: () => ({ meta: [{ title: pageTitle("How progress works") }] }),
  component: HowProgressWorks,
});

export const INTRO_SEEN_KEY = "florence:intro-seen";

const SAMPLE: RosePetal[] = [0.92, 0.62, 0.72, 0.38, 0.55, 0.78].map((m, i) => ({
  id: `sample-${i}`,
  name: "",
  colour: null,
  index: i,
  mastery: m,
  percent: Math.round(m * 100),
  state: "growing",
}));

/** Students meet the rose once, on this screen, before their first review. */
function HowProgressWorks() {
  const { data } = useProgress();
  useEffect(() => {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // Private mode: they may see this screen once more. That's fine.
    }
  }, []);
  const minutes = data?.plan.newCards ? estimateMinutes(data.plan.newCards.count) : 3;
  return (
    <div className="dark fixed inset-0 z-50 flex flex-col overflow-y-auto bg-night text-linen">
      <div className="lamp-glow mx-auto flex w-full max-w-[480px] flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <p className="text-[13px] font-semibold text-mist">How progress works</p>
        <div className="mt-6 flex justify-center">
          <ProgressRose
            petals={
              data?.subjects.length
                ? data.subjects.map((s, i) => ({ ...s, mastery: SAMPLE[i % 6].mastery }))
                : SAMPLE
            }
            size={220}
            glow
            title="An example progress rose"
          />
        </div>
        <h1 className="mt-8 font-display text-[32px] leading-[1.08]">Each petal is a subject.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-linen/85">
          A longer petal means you remember more of that subject's cards and do better on its
          quizzes. Petals can shrink if you stop reviewing, and grow back when you return.
        </p>
        <div className="mt-auto pt-10">
          <Link
            to="/session"
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-lamp text-[15px] font-semibold text-night"
          >
            Start my first review · {minutes} min
          </Link>
          <p className="mt-3 text-center text-[13px] text-mist">
            Tap any petal later to see its subject.
          </p>
          <Link
            to="/home"
            className="mt-1 flex min-h-11 items-center justify-center text-[14px] font-semibold text-linen/80"
          >
            Not now
          </Link>
        </div>
      </div>
    </div>
  );
}
