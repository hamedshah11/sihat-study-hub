import { useEffect, useId, useRef, useState } from "react";
import { petalColour } from "@/lib/subject-colours";
import { STATE_LABEL, type PetalState } from "@/lib/mastery";
import { petalPath, ROSE_CENTRE, ROSE_FULL, ROSE_INNER, ROSE_STROKE, rosePetalLength } from "./rose-geometry";
import { cn } from "@/lib/utils";

export type RosePetal = {
  id: string;
  name: string;
  colour: string | null;
  index: number;
  /** 0–1, or null when the subject has not been started. */
  mastery: number | null;
  percent: number;
  state: PetalState;
};

const PLACEHOLDER: RosePetal[] = Array.from({ length: 6 }, (_, i) => ({
  id: `placeholder-${i}`,
  name: "",
  colour: null,
  index: i,
  mastery: null,
  percent: 0,
  state: "not_started",
}));

function useTween(target: number, from: number | undefined, duration = 1200) {
  const [value, setValue] = useState(from ?? target);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (from === undefined) {
      setValue(target);
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (target - from) * ease(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    const delay = window.setTimeout(() => {
      frame.current = requestAnimationFrame(tick);
    }, 350);
    return () => {
      window.clearTimeout(delay);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, from, duration]);
  return value;
}

function Petal({
  petal,
  angle,
  halfAngle,
  growFrom,
  selected,
  interactive,
  onSelect,
}: {
  petal: RosePetal;
  angle: number;
  halfAngle: number;
  growFrom?: number;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
}) {
  const target = petal.mastery ?? 0;
  const mastery = useTween(target, growFrom);
  const ring = petalPath({ angle, halfAngle, inner: ROSE_INNER, outer: ROSE_FULL, gap: 3 });
  const fill =
    petal.mastery == null && growFrom === undefined
      ? null
      : petalPath({ angle, halfAngle, inner: ROSE_INNER, outer: rosePetalLength(mastery), gap: 3 });
  const colour = petalColour(petal.colour, petal.index);
  const label = petal.name
    ? `${petal.name}, ${petal.mastery == null ? "not started" : `${petal.percent}%, ${STATE_LABEL[petal.state]}`}`
    : undefined;
  return (
    <g
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? label : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? onSelect : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={interactive ? "cursor-pointer outline-none focus-visible:opacity-80" : undefined}
      strokeWidth={ROSE_STROKE}
      strokeLinejoin="round"
    >
      <path d={ring} fill="var(--rose-ring)" stroke="var(--rose-ring)" />
      {fill && <path d={fill} fill={colour} stroke={colour} opacity={selected || !interactive ? 1 : 0.95} />}
    </g>
  );
}

/**
 * A student's progress as a Nightingale rose: one petal per subject in the
 * semester, petal length showing mastery from 0 to 100%. A faint ring behind
 * each petal shows full length. Tapping a petal shows its name and number.
 */
export function ProgressRose({
  petals,
  size = 220,
  interactive = false,
  grow,
  glow = false,
  className,
  title,
}: {
  petals: RosePetal[];
  size?: number;
  interactive?: boolean;
  /** Animate one petal growing from an earlier mastery (session complete). */
  grow?: { id: string; from: number };
  glow?: boolean;
  className?: string;
  title?: string;
}) {
  const shown = petals.length > 0 ? petals : PLACEHOLDER;
  const n = Math.max(2, shown.length);
  const half = 180 / n;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = shown.find((p) => p.id === selectedId);
  const glowId = useId();
  return (
    <figure className={cn("flex flex-col items-center", className)}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={
          title ??
          (petals.length
            ? `Progress rose: ${petals.map((p) => `${p.name} ${p.mastery == null ? "not started" : `${p.percent}%`}`).join(", ")}`
            : "Progress rose, not started yet")
        }
        className="overflow-visible"
      >
        {glow && (
          <>
            <defs>
              <radialGradient id={glowId}>
                <stop offset="0%" stopColor="#F4B23E" stopOpacity="0.28" />
                <stop offset="45%" stopColor="#F4B23E" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#F4B23E" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="62" fill={`url(#${glowId})`} className="animate-lamp" />
          </>
        )}
        {shown.map((petal, i) => (
          <Petal
            key={petal.id}
            petal={petal}
            angle={i * (360 / n)}
            halfAngle={half}
            growFrom={grow?.id === petal.id ? grow.from : undefined}
            selected={selectedId === petal.id}
            interactive={interactive && petals.length > 0}
            onSelect={() => setSelectedId((id) => (id === petal.id ? null : petal.id))}
          />
        ))}
        <circle cx="50" cy="50" r={ROSE_CENTRE} fill="#F4B23E" />
      </svg>
      {interactive && petals.length > 0 && (
        <figcaption className="mt-3 min-h-5 text-center text-[13px] text-muted-foreground" aria-live="polite">
          {selected ? (
            <>
              <span className="font-semibold text-foreground">{selected.name}</span>
              {" · "}
              {selected.mastery == null ? "Not started" : `${selected.percent}% · ${STATE_LABEL[selected.state]}`}
            </>
          ) : (
            "Tap a petal to see its subject."
          )}
        </figcaption>
      )}
    </figure>
  );
}
