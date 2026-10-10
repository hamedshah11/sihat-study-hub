import { STATE_LABEL, type PetalState } from "@/lib/mastery";
import { cn } from "@/lib/utils";

/**
 * Petal states as neutral chips: a glyph plus a word, never a colour alone,
 * so they read the same in both themes and for colour-blind students.
 */
export function StateGlyph({ state, className }: { state: PetalState; className?: string }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 12 12",
    className,
    "aria-hidden": true,
  } as const;
  switch (state) {
    case "not_started":
      return (
        <svg {...common}>
          <circle
            cx="6"
            cy="6"
            r="4.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeDasharray="2 1.6"
          />
        </svg>
      );
    case "needs_light":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "growing":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 1.25 A4.75 4.75 0 0 1 6 10.75 Z" fill="currentColor" />
        </svg>
      );
    case "in_bloom":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="5.45" fill="currentColor" />
        </svg>
      );
  }
}

export function StatusChip({ state, className }: { state: PetalState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-chip px-2.5 text-[12.5px] font-semibold leading-none text-chip-foreground",
        className,
      )}
    >
      <StateGlyph state={state} />
      {STATE_LABEL[state]}
    </span>
  );
}
