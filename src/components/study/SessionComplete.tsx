import { useMemo } from "react";
import { ProgressRose } from "@/components/brand/ProgressRose";
import type { ProgressPayload } from "@/lib/progress.functions";

function shortName(name: string) {
  return name.replace(/\s+I{1,3}$/u, "");
}

/**
 * Every session ends with a small, specific win: the petal that grew, the
 * new number, and days in a row. A session that holds a petal steady still
 * counts and still ends well.
 */
export function SessionComplete({
  before,
  after,
  subjectIds,
  label,
  onDone,
}: {
  before?: ProgressPayload;
  after?: ProgressPayload;
  /** Subjects studied in this session, if known. */
  subjectIds?: string[];
  /** e.g. "Session complete · 18 cards" */
  label: string;
  onDone: () => void;
}) {
  const result = useMemo(() => {
    if (!after) return null;
    const pool = after.subjects.filter((s) => !subjectIds?.length || subjectIds.includes(s.id));
    let best: { id: string; name: string; from: number; to: number } | null = null;
    for (const s of pool.length ? pool : after.subjects) {
      const prev = before?.subjects.find((b) => b.id === s.id);
      const from = prev?.mastery ?? 0;
      const to = s.mastery ?? 0;
      if (!best || to - from > best.to - best.from) best = { id: s.id, name: s.name, from, to };
    }
    return best;
  }, [after, before, subjectIds]);

  const grew = result ? Math.round(result.to * 100) > Math.round(result.from * 100) : false;
  const days = after?.daysInRow ?? 0;

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col overflow-y-auto bg-night text-linen">
      <div className="lamp-glow mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <p className="text-[14px] font-semibold text-linen">{label}</p>
        <div className="mt-8 rounded-full">
          {after ? (
            <ProgressRose
              petals={after.subjects}
              size={250}
              glow
              grow={result && grew ? { id: result.id, from: result.from } : undefined}
            />
          ) : (
            <div className="size-[230px] animate-pulse rounded-full bg-night-panel" />
          )}
        </div>
        <h1 className="mt-10 font-display text-[34px] leading-[1.12]">
          {!result
            ? "Session complete."
            : grew
              ? `Your ${shortName(result.name)} petal grew.`
              : `Your ${shortName(result.name)} petal held steady.`}
        </h1>
        {result && (
          <p className="fl-number mt-3 text-[15px] font-normal text-rate-good">
            {grew
              ? `${Math.round(result.from * 100)}% → ${Math.round(result.to * 100)}%`
              : `${Math.round(result.to * 100)}%`}
          </p>
        )}
        {result && !grew && (
          <p className="mt-2 max-w-[300px] text-[14px] text-mist">
            Keeping what you know is progress too. Reviews like this stop petals from shrinking.
          </p>
        )}
        {days > 0 && (
          <p className="mt-3 text-[15px] text-linen/90">
            {days} day{days === 1 ? "" : "s"} in a row
          </p>
        )}
        <div className="mt-auto w-full pt-10">
          <button
            type="button"
            onClick={onDone}
            className="h-[52px] w-full rounded-full bg-linen text-[15px] font-semibold text-night"
          >
            Done
          </button>
          <p className="mt-3 text-[13px] text-mist">
            Tomorrow's cards will be ready in the morning.
          </p>
        </div>
      </div>
    </div>
  );
}
