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
    <div className="min-h-screen bg-background flex flex-col">
      <div className="mx-auto w-full max-w-[480px] md:max-w-[640px] flex-1 flex flex-col px-6 pt-12 pb-8">
        <header className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">
            S
          </div>
          <span className="text-2xl font-bold text-primary tracking-tight">Sihat</span>
        </header>

        <main className="flex-1 flex flex-col justify-center py-16">
          <h1 className="text-4xl md:text-5xl font-bold text-primary leading-tight">
            Study smarter,<br />not harder.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Built for nursing students at every stage of the BSN curriculum.
          </p>

          <ul className="mt-10 space-y-4">
            <Feature icon={<BookOpen className="size-5" />}>
              Pre-built study material for your BSN curriculum
            </Feature>
            <Feature icon={<Sparkles className="size-5" />}>
              AI tutor for every chapter
            </Feature>
            <Feature icon={<Flame className="size-5" />}>
              Track your progress, build your streak
            </Feature>
          </ul>

          <div className="mt-12 flex flex-col gap-3">
            <Button asChild size="lg" className="rounded-lg h-12 text-base">
              <Link to="/signup">Sign up</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-lg h-12 text-base border-primary text-primary hover:bg-primary/5">
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

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-surface p-4">
      <span className="mt-0.5 inline-grid place-items-center size-9 rounded-lg bg-accent/10 text-accent">
        {icon}
      </span>
      <span className="text-foreground leading-snug">{children}</span>
    </li>
  );
}
