import type { WeekDay } from "@/lib/progress-snapshot";
import { cn } from "@/lib/utils";

/** A small lamp flame: lit for a day studied, outlined for a day not. */
export function Flame({ lit, className }: { lit: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 12 16" className={cn("h-4 w-3", className)} aria-hidden>
      <path
        d="M6 1.2C6.9 3.6 10.4 6 10.4 9.6A4.4 4.4 0 0 1 1.6 9.6C1.6 7.6 2.9 6.4 3.8 5.4c.2 1.4.9 2.2 1.6 2.4C5.2 5.6 5.4 3.2 6 1.2Z"
        fill={lit ? "var(--color-lamp)" : "none"}
        stroke={lit ? "var(--color-lamp)" : "var(--border-strong)"}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Study days in a row, counted 4 am to 4 am. A missed day is a pause, never a
 * failure, so the copy stays calm at zero.
 */
export function DaysInRow({ week, count }: { week: WeekDay[]; count: number }) {
  const studiedThisWeek = week.filter((d) => d.studied).length;
  return (
    <div className="animate-fade-up stagger-3 flex items-center gap-3 rounded-[20px] border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5" aria-hidden>
        {week.map((d) => (
          <Flame key={d.date} lit={d.studied} />
        ))}
      </div>
      <p className="ml-auto text-[14px] font-semibold">
        {count > 0 ? (
          <>
            {count} day{count === 1 ? "" : "s"} in a row
          </>
        ) : (
          <span className="font-medium text-muted-foreground">
            {studiedThisWeek > 0
              ? `${studiedThisWeek} day${studiedThisWeek === 1 ? "" : "s"} this week`
              : "Welcome back. Let's pick up where you left off."}
          </span>
        )}
      </p>
      <span className="sr-only">
        This week:{" "}
        {week.map((d) => `${d.label} ${d.studied ? "studied" : "not studied"}`).join(", ")}
      </span>
    </div>
  );
}
