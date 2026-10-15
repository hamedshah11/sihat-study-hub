import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "@/components/AuthShell";
import { pageTitle } from "@/lib/brand";
import { ERROR_LOG_DAYS, PRIVACY_CONTACT_EMAIL, PRIVACY_UPDATED } from "@/lib/privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: pageTitle("Privacy") },
      { name: "description", content: "How Florence uses and protects your information." },
    ],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[15px] leading-relaxed text-foreground/85">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function PrivacyPage() {
  return (
    <AuthShell
      heading="Privacy"
      title="How Florence uses your information"
      subtitle={`Last updated ${PRIVACY_UPDATED}. Written to be read in five minutes.`}
    >
      <div className="pb-6">
        <Section title="Who we are">
          <p>
            Florence is a study app for BSN nursing students. It is built and run by Hamed Shah,
            with SIHAT (Sindh Institute of Health and Technology, Khairpur Mirs) as its founding
            partner college. SIHAT faculty review the content you study.
          </p>
        </Section>

        <Section title="What we keep">
          <List
            items={[
              "Your name, the email address (or phone number) you sign in with, and your batch.",
              "Your studying: flashcards you review and how you rate them, quiz and practice exam answers and scores, chapters you open, and your days studied.",
              "Questions you ask Ask Florence and the answers it gives.",
              "Problems you report about a question or flashcard, and your settings.",
              `If something breaks on your phone: the page you were on, the error, and your browser type, kept for ${ERROR_LOG_DAYS} days so we can fix it.`,
              "How long the app's pages take to load, without your name or account.",
            ]}
          />
          <p>Files you download for offline use stay on your phone. Logging out removes them.</p>
        </Section>

        <Section title="Why we keep it">
          <List
            items={[
              "To sign you in and put you in the right batch and semester.",
              "To plan your flashcard reviews, bring back questions you got wrong, and show your progress.",
              "To answer your questions in Ask Florence.",
              "To find mistakes in the content and problems in the app, and fix them.",
            ]}
          />
          <p>We don't show adverts and we don't sell your information.</p>
        </Section>

        <Section title="Who can see it">
          <List
            items={[
              "You.",
              "SIHAT faculty and the Florence team, who can see your progress and answers to support your learning and check the content.",
              "Classmates see batch totals only, and, if you switch it on in a study circle, whether you studied today. They never see your scores, and nobody is ranked.",
            ]}
          />
        </Section>

        <Section title="Services Florence uses">
          <List
            items={[
              "Lovable Cloud, built on Supabase and Cloudflare, stores your account and studying and runs the app.",
              "Anthropic's Claude writes Ask Florence's answers. Your question and the chapter's notes are sent to it to make each answer. Under Anthropic's commercial terms, it does not use this to train its models.",
              "YouTube plays the chapter videos. A video only loads from YouTube when you tap it, and YouTube's own privacy policy applies from then.",
            ]}
          />
          <p>These services may store information on servers outside Pakistan.</p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep your account and studying while you use Florence. Error details are deleted
            after {ERROR_LOG_DAYS} days and page timings after about three days.
          </p>
        </Section>

        <Section title="Your choices">
          <List
            items={[
              "Study circles are off unless you switch them on, in Settings.",
              "You can delete your account in Settings. This permanently removes your profile, progress, flashcard reviews, quiz and exam history, Ask Florence chats, reports and settings.",
              "You can ask to see the information we hold about you, or to correct it.",
            ]}
          />
        </Section>

        <Section title="Questions">
          <p>
            {PRIVACY_CONTACT_EMAIL ? (
              <>
                Write to{" "}
                <a
                  href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                  className="font-semibold text-accent-ink"
                >
                  {PRIVACY_CONTACT_EMAIL}
                </a>
                , or speak to your class coordinator at SIHAT.
              </>
            ) : (
              "Speak to your class coordinator at SIHAT, who will pass your question to the Florence team."
            )}
          </p>
          <p>
            If this notice changes in a way that matters, Florence will ask you to agree again
            before you carry on.
          </p>
        </Section>
      </div>
    </AuthShell>
  );
}
