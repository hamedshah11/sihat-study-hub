import confetti from "canvas-confetti";

let lastBurstAt = 0;

/**
 * Fire a short, non-blocking confetti burst. Pointer events are disabled
 * on the canvas by the library, so navigation is never blocked.
 * Throttled so rapid retriggers don't stack.
 */
export function celebrate(intensity: "small" | "big" = "small") {
  const now = Date.now();
  if (now - lastBurstAt < 600) return;
  lastBurstAt = now;

  const opts = {
    spread: intensity === "big" ? 90 : 70,
    startVelocity: intensity === "big" ? 45 : 35,
    particleCount: intensity === "big" ? 90 : 55,
    ticks: 120, // ~1.2s lifespan
    origin: { y: 0.4 },
    scalar: 0.9,
    disableForReducedMotion: true,
  };

  try {
    confetti(opts);
    if (intensity === "big") {
      setTimeout(() => confetti({ ...opts, origin: { y: 0.5, x: 0.2 } }), 150);
      setTimeout(() => confetti({ ...opts, origin: { y: 0.5, x: 0.8 } }), 300);
    }
  } catch {
    // SSR / no-DOM: ignore
  }
}

const LEVEL_KEY = "sihat:last-seen-level";

/** Returns true (and fires confetti) the first time we detect a level increase. */
export function checkLevelUp(currentLevel: number): boolean {
  if (typeof window === "undefined") return false;
  const prev = Number(localStorage.getItem(LEVEL_KEY) ?? "0");
  localStorage.setItem(LEVEL_KEY, String(currentLevel));
  if (prev > 0 && currentLevel > prev) {
    celebrate("big");
    return true;
  }
  return false;
}
