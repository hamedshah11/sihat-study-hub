// The new-student tour (/intro) and the one-time hints that follow it.
//
// "Seen" lives in two places. The auth user's metadata (tutorial_version,
// tutorial_hints) follows the student to another phone or a laptop; this
// phone's localStorage answers straight away and still works with no signal.
// A student has seen something if either says so. Nothing here is security:
// it only decides whether to show a helpful screen again.

/** Bump to show the tour once more to everyone (for example after a redesign). */
export const TUTORIAL_VERSION = 1;

/** localStorage: the tour was finished or skipped on this phone. */
export const INTRO_SEEN_KEY = "florence:intro-seen";

const HINT_KEY_PREFIX = "florence:hint:";

/** One hint per place a new student lands after the tour. */
export const HINT_IDS = ["subjects", "chapter", "ask", "batch"] as const;
export type HintId = (typeof HINT_IDS)[number];

type Metadata = Record<string, unknown> | null | undefined;

/** The account has finished or skipped the current tour. */
export function hasSeenTutorial(metadata: Metadata) {
  const v = metadata?.tutorial_version;
  return typeof v === "number" && v >= TUTORIAL_VERSION;
}

/** Hints already dismissed on this account. Unknown ids are dropped. */
export function seenHints(metadata: Metadata): HintId[] {
  const raw = metadata?.tutorial_hints;
  if (!Array.isArray(raw)) return [];
  return HINT_IDS.filter((id) => raw.includes(id));
}

/**
 * Hints follow the tour: an account that never took it (staff, students from
 * before it existed) isn't shown hints, and each hint shows once.
 */
export function shouldShowHint(id: HintId, metadata: Metadata, dismissedHere: boolean) {
  if (dismissedHere) return false;
  if (!hasSeenTutorial(metadata)) return false;
  return !seenHints(metadata).includes(id);
}

/** Metadata to save when the tour is finished or skipped. */
export function tutorialSeenMetadata() {
  return { tutorial_version: TUTORIAL_VERSION };
}

/** Metadata to save when a hint is dismissed, keeping the earlier ones. */
export function hintSeenMetadata(id: HintId, metadata: Metadata) {
  return { tutorial_hints: [...new Set([...seenHints(metadata), id])] };
}

/** Metadata for "Show the tour again": every hint comes back after it. */
export function hintsResetMetadata() {
  return { tutorial_hints: null };
}

// localStorage can throw in private mode; the tour then shows once more at
// worst, and a hint stays until the account copy is saved.

export function introSeenHere() {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function markIntroSeenHere() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // Private mode.
  }
}

export function hintDismissedHere(id: HintId) {
  try {
    return localStorage.getItem(HINT_KEY_PREFIX + id) !== null;
  } catch {
    return false;
  }
}

export function markHintDismissedHere(id: HintId) {
  try {
    localStorage.setItem(HINT_KEY_PREFIX + id, "1");
  } catch {
    // Private mode.
  }
}

/** Forget this phone's dismissed hints, for "Show the tour again". */
export function resetHintsHere() {
  try {
    for (const id of HINT_IDS) localStorage.removeItem(HINT_KEY_PREFIX + id);
  } catch {
    // Private mode.
  }
}
