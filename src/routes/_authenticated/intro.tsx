import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { BookOpen, CircleHelp, Layers, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FlorenceMark } from "@/components/brand/FlorenceMark";
import { ProgressRose, type RosePetal } from "@/components/brand/ProgressRose";
import { useProgress } from "@/lib/progress-data";
import { pageTitle } from "@/lib/brand";
import { estimateMinutes } from "@/lib/mastery";
import { markIntroSeenHere, tutorialSeenMetadata } from "@/lib/tutorial";

export const Route = createFileRoute("/_authenticated/intro")({
  head: () => ({ meta: [{ title: pageTitle("How Florence works") }] }),
  component: Tour,
});

const SAMPLE: RosePetal[] = [0.92, 0.62, 0.72, 0.38, 0.55, 0.78].map((m, i) => ({
  id: `sample-${i}`,
  name: "",
  colour: null,
  index: i,
  mastery: m,
  percent: Math.round(m * 100),
  state: "growing",
}));

const STEP_COUNT = 5;

/**
 * The tour a new student takes once, before their first review: what
 * Florence is, the daily review, what a chapter holds, Ask Florence and the
 * progress rose. Five short Night screens, skippable from any of them.
 * Settings → "Show the tour again" opens it later. Finishing or skipping
 * saves "seen" on this phone and on the account (`src/lib/tutorial.ts`), and
 * switches on the one-time hints (`TutorialHint`).
 */
function Tour() {
  const { data } = useProgress();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const firstReview = data?.firstDay && (data.plan.newCards || data.plan.cardsDue > 0);
  const minutes = data?.plan.newCards ? estimateMinutes(data.plan.newCards.count) : 3;

  /** Leave the tour for good. Saving to the account is best effort. */
  function finish(to: "/session" | "/home") {
    markIntroSeenHere();
    void supabase.auth.updateUser({ data: tutorialSeenMetadata() }).catch(() => undefined);
    void navigate({ to });
  }

  const last = step === STEP_COUNT - 1;

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col overflow-y-auto bg-night text-linen">
      <div className="lamp-glow mx-auto flex w-full max-w-[480px] flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex min-h-11 items-center justify-between">
          <p className="text-[13px] font-bold uppercase tracking-[0.05em] text-mist">
            Step {step + 1} of {STEP_COUNT}
          </p>
          {!last && (
            <button
              onClick={() => finish("/home")}
              className="-mr-2 min-h-11 px-2 text-[14px] font-semibold text-mist"
            >
              Skip
            </button>
          )}
        </div>

        <div className="mt-4 flex min-h-[250px] items-center justify-center" aria-hidden={!last}>
          {step === 0 && <FlorenceMark size={148} variant="night" />}
          {step === 1 && <TodayPreview data={data} minutes={minutes} />}
          {step === 2 && <ChapterPreview />}
          {step === 3 && <AskPreview />}
          {step === 4 && (
            <ProgressRose
              petals={
                data?.subjects.length
                  ? data.subjects.map((s, i) => ({ ...s, mastery: SAMPLE[i % 6].mastery }))
                  : SAMPLE
              }
              size={250}
              glow
              title="An example progress rose"
            />
          )}
        </div>

        {/* Keyed so a screen reader announces each step's heading. */}
        <div key={step} className="animate-fade-up">
          {step === 0 && (
            <Copy heading="Welcome to Florence.">
              Your Semester 1 subjects in one place: notes, flashcards and quizzes for every
              chapter. A few minutes a day is enough.
            </Copy>
          )}
          {step === 1 && (
            <Copy heading="Start with today's review.">
              Today shows the cards that are due. Florence brings each card back just before you
              would forget it, so a short review every day works better than a long night before the
              exam.
            </Copy>
          )}
          {step === 2 && (
            <Copy heading="Every chapter, four ways.">
              Open Subjects and pick a chapter. Read the notes first, then practise. You can
              download a chapter to read it with no signal.
            </Copy>
          )}
          {step === 3 && (
            <Copy heading="Stuck? Ask Florence.">
              Ask a question inside any chapter. The answer comes from that chapter's notes and
              names the section it came from. You can ask 50 questions a day.
            </Copy>
          )}
          {step === 4 && (
            <Copy heading="Each petal is a subject.">
              A longer petal means you remember more of that subject's cards and do better on its
              quizzes. Petals can shrink if you stop reviewing, and grow back when you return.
            </Copy>
          )}
        </div>

        <div className="mt-auto pt-8">
          <div
            className="mb-5 flex justify-center gap-2"
            role="img"
            aria-label={`Step ${step + 1} of ${STEP_COUNT}`}
          >
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-lamp" : "w-1.5 bg-linen/25"
                }`}
              />
            ))}
          </div>
          {last ? (
            <button
              onClick={() => finish(firstReview ? "/session" : "/home")}
              className="flex h-[52px] w-full items-center justify-center rounded-full bg-lamp text-[15px] font-semibold text-night"
            >
              {firstReview ? `Start my first review · ${minutes} min` : "Go to Today"}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex h-[52px] w-full items-center justify-center rounded-full bg-lamp text-[15px] font-semibold text-night"
            >
              Next
            </button>
          )}
          <div className="mt-1 flex min-h-11 items-center justify-center">
            {step > 0 ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="min-h-11 px-4 text-[14px] font-semibold text-mist"
              >
                Back
              </button>
            ) : (
              <p className="text-[13px] text-mist">Five short screens. About a minute.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Copy({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <>
      <h1 className="mt-8 font-display text-[34px] leading-[1.08]">{heading}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-linen/85">{children}</p>
    </>
  );
}

/** A picture of Today's lamp card, with the student's own first cards when known. */
function TodayPreview({
  data,
  minutes,
}: {
  data: ReturnType<typeof useProgress>["data"];
  minutes: number;
}) {
  const fresh = data?.plan.newCards;
  return (
    <div className="w-full max-w-[320px] rounded-[24px] bg-lamp p-5 text-night">
      <p className="text-[12px] font-bold uppercase tracking-[0.04em]">Today's review</p>
      <p className="mt-2 text-[22px] font-semibold leading-tight">
        {fresh ? `${fresh.count} cards · ${fresh.subjectName}` : "10 cards · 1 quiz"}
      </p>
      <p className="mt-1.5 text-[13.5px] text-night/75">About {minutes} minutes.</p>
      <div className="mt-4 flex h-11 items-center justify-center rounded-full bg-night text-[14px] font-semibold text-linen">
        Start review
      </div>
    </div>
  );
}

const CHAPTER_PARTS = [
  { icon: BookOpen, name: "Notes", detail: "The chapter, with exam traps marked" },
  { icon: Layers, name: "Flashcards", detail: "Rate each card; hard ones return sooner" },
  { icon: CircleHelp, name: "Quiz", detail: "Five questions, each one explained" },
  { icon: MessageCircle, name: "Ask Florence", detail: "Questions about this chapter" },
];

function ChapterPreview() {
  return (
    <ul className="w-full max-w-[340px] divide-y divide-white/10 rounded-[22px] bg-night-panel px-4">
      {CHAPTER_PARTS.map(({ icon: Icon, name, detail }) => (
        <li key={name} className="flex items-center gap-3 py-3">
          <Icon className="size-5 shrink-0 text-lamp" />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">{name}</span>
            <span className="block text-[13px] leading-snug text-mist">{detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AskPreview() {
  return (
    <div className="w-full max-w-[340px] space-y-2.5 text-[14px] leading-snug">
      <p className="ml-10 rounded-[18px] rounded-br-md bg-lamp px-4 py-2.5 text-night">
        What is the difference between medical and surgical asepsis?
      </p>
      <div className="mr-6 rounded-[18px] rounded-bl-md bg-night-panel px-4 py-2.5">
        <p>
          Medical asepsis reduces the number of microorganisms. Surgical asepsis removes all of
          them.
        </p>
        <p className="mt-1.5 text-[12.5px] text-mist">From the notes: Asepsis</p>
      </div>
    </div>
  );
}
