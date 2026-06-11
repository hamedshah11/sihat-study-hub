import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen, Flame } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sihat — Study smarter, not harder" },
      { name: "description", content: "A mobile-first study app for BSN nursing students. Pre-built study material, an AI tutor for every chapter, and progress tracking." },
      { property: "og:title", content: "Sihat — Study smarter, not harder" },
      { property: "og:description", content: "A mobile-first study app for BSN nursing students." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-background flex flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-float-slow absolute -top-32 -right-24 size-[440px] rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute top-1/2 -left-36 size-[400px] rounded-full bg-primary/[0.08] blur-3xl" />
        <div className="animate-float-slow absolute -bottom-40 right-1/4 size-[360px] rounded-full bg-streak/[0.08] blur-3xl [animation-delay:-4s]" />
      </div>
      <div className="mx-auto w-full max-w-[480px] md:max-w-[640px] flex-1 flex flex-col px-6 pt-12 pb-8">
        <header className="animate-fade-up flex items-center gap-2.5">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground grid place-items-center font-bold shadow-glow">
            S
          </div>
          <span className="font-display text-2xl font-bold text-primary tracking-tight">Sihat</span>
        </header>

        <main className="flex-1 flex flex-col justify-center py-16">
          <h1 className="animate-fade-up stagger-1 font-display text-4xl md:text-5xl font-bold leading-tight text-primary">
            Study smarter,<br />
            <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">not harder.</span>
          </h1>
          <p className="animate-fade-up stagger-2 mt-4 text-muted-foreground">
            Built for nursing students at every stage of the BSN curriculum.
          </p>

          <ul className="mt-10 space-y-4">
            <Feature stagger="stagger-3" tone="teal" icon={<BookOpen className="size-5" />}>
              Pre-built study material for your BSN curriculum
            </Feature>
            <Feature stagger="stagger-4" tone="navy" icon={<Sparkles className="size-5" />}>
              AI tutor for every chapter
            </Feature>
            <Feature stagger="stagger-5" tone="flame" icon={<Flame className="size-5" />}>
              Track your progress, build your streak
            </Feature>
          </ul>

          <div className="animate-fade-up stagger-6 mt-12 flex flex-col gap-3">
            <Button asChild size="lg" className="rounded-xl h-12 text-base shadow-lifted transition-transform hover:scale-[1.01] active:scale-[0.99]">
              <Link to="/signup">Sign up</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl h-12 text-base border-primary text-primary hover:bg-primary/5">
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </main>

        <footer className="text-center text-sm text-muted-foreground">
          Made for Sindh Institute
        </footer>
      </div>
    </div>
  );
}

const FEATURE_TONES = {
  teal: "bg-accent/10 text-accent",
  navy: "bg-primary/10 text-primary",
  flame: "bg-streak/10 text-streak",
} as const;

function Feature({
  icon,
  tone,
  stagger,
  children,
}: {
  icon: React.ReactNode;
  tone: keyof typeof FEATURE_TONES;
  stagger: string;
  children: React.ReactNode;
}) {
  return (
    <li className={`animate-fade-up ${stagger} flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-soft`}>
      <span className={`mt-0.5 inline-grid place-items-center size-10 rounded-xl ${FEATURE_TONES[tone]}`}>
        {icon}
      </span>
      <span className="text-foreground leading-snug pt-1.5">{children}</span>
    </li>
  );
}
