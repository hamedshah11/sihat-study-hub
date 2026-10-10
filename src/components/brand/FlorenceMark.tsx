import { markGeometry, ROSE_STROKE } from "./rose-geometry";

/**
 * Colour versions from the brand book:
 * - "theme": follows the current theme (Night petals + Deep amber on light,
 *   Linen petals + Lamplight on Night ward). The default inside the app.
 * - "night": for Night ward backgrounds (Linen petals, Lamplight lit).
 * - "paper": for Linen or white (Night petals, Deep amber lit).
 * - "lamp": for Lamplight backgrounds (Night petals, Linen lit).
 * - "mono": one colour, from `currentColor`.
 */
export type MarkVariant = "theme" | "night" | "paper" | "lamp" | "mono";

const COLOURS: Record<MarkVariant, { petal: string; lit: string }> = {
  theme: { petal: "var(--foreground)", lit: "#F4B23E" },
  night: { petal: "#FBF6EC", lit: "#F4B23E" },
  paper: { petal: "#141B2D", lit: "#9C5A08" },
  lamp: { petal: "#141B2D", lit: "#FBF6EC" },
  mono: { petal: "currentColor", lit: "currentColor" },
};

export function FlorenceMark({
  size = 32,
  variant = "theme",
  className,
  title,
}: {
  size?: number;
  variant?: MarkVariant;
  className?: string;
  /** Accessible name; omit when the mark sits next to the wordmark. */
  title?: string;
}) {
  const { petals, centreRadius } = markGeometry(size <= 24);
  const { petal, lit } = COLOURS[variant];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g strokeWidth={ROSE_STROKE} strokeLinejoin="round">
        <path d={petals[0]} fill={lit} stroke={lit} />
        <g fill={petal} stroke={petal}>
          {petals.slice(1).map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </g>
      <circle cx="50" cy="50" r={centreRadius} fill={lit} />
    </svg>
  );
}
