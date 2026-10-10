import { FlorenceMark, type MarkVariant } from "./FlorenceMark";
import { cn } from "@/lib/utils";

/** "florence" in lowercase, only ever inside the logo. The f sits slightly apart. */
export function Wordmark({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cn("fl-wordmark leading-none", className)} style={style}>
      <span style={{ marginRight: "0.025em" }}>f</span>lorence
    </span>
  );
}

/**
 * "Powered by SIHAT": small capitals, wide spacing. Never bigger than a fifth
 * of the wordmark's height and never smaller than 9 px; below that, drop it.
 */
export function Endorsement({
  className,
  tone = "theme",
}: {
  className?: string;
  tone?: "theme" | "night";
}) {
  return (
    <span
      className={cn(
        "block text-[9px] font-semibold uppercase leading-none tracking-[0.18em]",
        tone === "night" ? "text-mist" : "text-muted-foreground",
        className,
      )}
    >
      Powered by{" "}
      <b className={cn("font-bold", tone === "night" ? "text-linen" : "text-foreground")}>SIHAT</b>
    </span>
  );
}

/**
 * Primary lockup: mark left, wordmark right, endorsement right-aligned
 * beneath. Stacked: mark above wordmark (splash screen, promo end card).
 */
export function Lockup({
  layout = "horizontal",
  height = 28,
  endorsement = true,
  variant = "theme",
  className,
}: {
  layout?: "horizontal" | "stacked";
  /** Wordmark cap height in px, roughly. */
  height?: number;
  endorsement?: boolean;
  variant?: MarkVariant;
  className?: string;
}) {
  const night = variant === "night";
  const textColour = night ? "text-linen" : variant === "paper" ? "text-night" : "text-foreground";
  // Drop the endorsement where it would fall under 9 px.
  const showEndorsement = endorsement && height / 5 >= 4.5;
  if (layout === "stacked") {
    return (
      <div
        className={cn("flex flex-col items-center", className)}
        aria-label="Florence, powered by SIHAT"
        role="img"
      >
        <FlorenceMark size={height * 3.2} variant={variant} />
        <Wordmark className={cn("mt-[0.35em]", textColour)} style={{ fontSize: height * 1.9 }} />
        {showEndorsement && <Endorsement tone={night ? "night" : "theme"} className="mt-2" />}
      </div>
    );
  }
  return (
    <div
      className={cn("inline-flex items-center", className)}
      role="img"
      aria-label="Florence, powered by SIHAT"
    >
      <FlorenceMark size={height * 1.45} variant={variant} />
      <span className="ml-[0.3em] inline-flex flex-col items-end" style={{ fontSize: height }}>
        <Wordmark className={textColour} style={{ fontSize: height * 1.05 }} />
        {showEndorsement && (
          <Endorsement
            tone={night ? "night" : "theme"}
            className="mt-[0.3em] whitespace-nowrap !tracking-[0.14em]"
          />
        )}
      </span>
    </div>
  );
}
