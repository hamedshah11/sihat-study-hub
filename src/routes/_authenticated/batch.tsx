import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { NeedsInternet, useOnline } from "@/components/OfflineBanner";
import { useProgress } from "@/lib/progress-data";
import {
  createCircle,
  getBatchOverview,
  joinCircle,
  leaveCircle,
  type BatchOverview,
} from "@/lib/batch.functions";
import { FOUNDING_PARTNER, pageTitle } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/batch")({
  head: () => ({ meta: [{ title: pageTitle("Your batch") }] }),
  component: BatchPage,
});

const BATCH_KEY = ["batch-overview"] as const;

/**
 * Your batch: class totals and your own week. Progress is private by
 * default; the study circle is opt-in, shows only whether each friend studied
 * today, and is never ranked.
 */
function BatchPage() {
  const { data: progress } = useProgress();
  const load = useServerFn(getBatchOverview);
  const { data, isLoading } = useQuery({
    queryKey: BATCH_KEY,
    queryFn: () => load(),
    staleTime: 60_000,
  });
  const online = useOnline();

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      <TopBar initial={progress?.student.initial} />
      <header className="animate-fade-up pt-1">
        <h1 className="font-display text-[30px] leading-tight md:text-[36px]">Your batch</h1>
        {data?.batchName && (
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            {[
              data.programmeName ?? data.batchName,
              FOUNDING_PARTNER.short,
              data.students ? `${data.students} students` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </header>

      {!online && !data ? (
        <NeedsInternet title="Your batch needs internet.">
          <p className="mt-1 text-sm text-muted-foreground">
            Class totals and your study circle load when you're back online.
          </p>
        </NeedsInternet>
      ) : isLoading || !data ? (
        <>
          <Skeleton className="h-[140px] rounded-[24px]" />
          <Skeleton className="h-[110px] rounded-[22px]" />
          <Skeleton className="h-[150px] rounded-[22px]" />
        </>
      ) : !data.batchName ? (
        <div className="rounded-[22px] border bg-card p-5">
          <h2 className="font-display text-[22px]">You're not in a batch yet.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask your class coordinator for your batch code, then enter it in Settings.
          </p>
          <Link
            to="/profile"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Enter batch code
          </Link>
        </div>
      ) : (
        <section className="animate-fade-up stagger-1 rounded-[22px] border bg-card p-5">
          <p className="text-[14px] font-semibold">This week, together</p>
          <p className="mt-1 font-display text-[36px] leading-tight text-accent-ink dark:text-lamp">
            {data.reviewsThisWeek.toLocaleString("en-GB")} review
            {data.reviewsThisWeek === 1 ? "" : "s"}
          </p>
          <p className="mt-1.5 text-[15px] leading-snug text-muted-foreground">
            {data.hardestSubject
              ? `${data.hardestSubject} is the subject the batch finds hardest right now.`
              : data.reviewsThisWeek > 0
                ? "Every review counts towards the batch's week."
                : "The week has just started. Your first review counts for everyone."}
          </p>
        </section>
      )}

      {progress && (
        <section className="animate-fade-up stagger-2 rounded-[22px] border bg-card p-4">
          <p className="text-[14px] font-semibold">Your week</p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {progress.week.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "aspect-square w-full max-w-10 rounded-full",
                    d.studied ? "bg-lamp" : "border-2 border-dashed border-border-strong/60",
                  )}
                />
                <span
                  className={cn("text-[12px]", d.isToday ? "font-bold" : "text-muted-foreground")}
                >
                  {d.label}
                </span>
                <span className="sr-only">{d.studied ? "studied" : "not studied"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data && <StudyCircle circle={data.circle} />}
    </div>
  );
}

function StudyCircle({ circle }: { circle: BatchOverview["circle"] }) {
  const qc = useQueryClient();
  const create = useServerFn(createCircle);
  const join = useServerFn(joinCircle);
  const leave = useServerFn(leaveCircle);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);

  if (!circle.available) {
    return (
      <section className="rounded-[22px] border bg-card p-4">
        <p className="text-[15px] font-semibold">Study circle</p>
        <p className="mt-1 text-[13.5px] text-muted-foreground">Study circles are coming soon.</p>
      </section>
    );
  }

  const refresh = () => qc.invalidateQueries({ queryKey: BATCH_KEY });
  const errors: Record<string, string> = {
    not_found: "That circle code didn't work. Check it with your friend.",
    full: "That circle already has six people.",
    already_in_circle: "You're already in a circle. Leave it first to join another.",
    unavailable: "Study circles aren't available right now.",
  };

  async function run(action: () => Promise<{ ok: boolean; reason?: string }>) {
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) toast.error(errors[res.reason ?? "unavailable"] ?? errors.unavailable);
      await refresh();
    } catch {
      toast.error("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!circle.code) {
    return (
      <section className="animate-fade-up stagger-3 rounded-[22px] border-2 border-dashed border-border-strong/45 p-5">
        <p className="text-[16px] font-semibold">Study circle · off</p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Choose up to 5 friends to see when each of you studied today. No scores, no rankings.
        </p>
        {joining ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => join({ data: { code } }));
            }}
          >
            <label htmlFor="circle-code" className="sr-only">
              Circle code
            </label>
            <input
              id="circle-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="Circle code"
              autoCapitalize="characters"
              className="fl-number h-11 min-w-0 flex-1 rounded-full border border-input bg-card px-4 text-[15px] tracking-[0.2em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              disabled={busy || code.length !== 6}
              className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Join
            </button>
          </form>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-5">
            <button
              disabled={busy}
              onClick={() => void run(() => create())}
              className="min-h-11 text-[15px] font-semibold text-accent-ink disabled:opacity-50"
            >
              Set up a circle
            </button>
            <button
              onClick={() => setJoining(true)}
              className="min-h-11 text-[14px] font-medium text-muted-foreground"
            >
              Have a code? Join a circle
            </button>
          </div>
        )}
      </section>
    );
  }

  const circleCode = circle.code;
  const shareText = `Join my Florence study circle. Open Florence, go to Batch, tap "Have a code? Join a circle" and enter ${circleCode}.`;
  async function shareCode() {
    try {
      if (navigator.share) await navigator.share({ text: shareText });
      else {
        await navigator.clipboard.writeText(circleCode);
        toast.success("Code copied.");
      }
    } catch {
      // Closing the share sheet is fine.
    }
  }

  return (
    <section className="animate-fade-up stagger-3 rounded-[22px] border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-semibold">Study circle</p>
        <p className="text-[12.5px] text-muted-foreground">Studied today?</p>
      </div>
      <ul className="mt-3 space-y-2">
        {circle.members.map((m, i) => (
          <li key={i} className="flex min-h-10 items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-muted text-sm font-semibold">
              {m.firstName[0]?.toUpperCase()}
            </span>
            <span className="flex-1 text-[14.5px]">
              {m.firstName}
              {m.isMe && <span className="text-muted-foreground"> (you)</span>}
            </span>
            <span className="text-[13px] text-muted-foreground">
              {m.studiedToday === null ? (
                "Hidden"
              ) : m.studiedToday ? (
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  <Check className="size-4 text-accent-ink" aria-hidden /> Studied
                </span>
              ) : (
                "Not yet"
              )}
            </span>
          </li>
        ))}
      </ul>
      {circle.members.length < 6 && (
        <div className="mt-4 rounded-2xl bg-muted p-3">
          <p className="text-[13px] text-muted-foreground">Invite friends with this code</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="fl-number flex-1 text-[22px] tracking-[0.25em]">{circle.code}</span>
            <button
              onClick={() => void shareCode()}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground"
            >
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <Share2 className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              Share
            </button>
          </div>
        </div>
      )}
      <button
        disabled={busy}
        onClick={() => void run(() => leave())}
        className="mt-3 min-h-11 text-[13.5px] font-medium text-muted-foreground hover:text-foreground"
      >
        Leave this circle
      </button>
    </section>
  );
}
