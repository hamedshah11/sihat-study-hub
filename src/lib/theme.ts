// Florence themes: Light, Dark (Lamplight mode) or Automatic.
//
// Automatic uses Lamplight mode from 8 pm to 6 am local time, whatever the
// phone's own setting is, and never switches in the middle of a study
// session: a session started at 7:55 pm stays light until it ends.

export const THEME_STORAGE_KEY = "florence-theme";
const LEGACY_THEME_STORAGE_KEY = "sihat-theme";

export type ThemePreference = "auto" | "light" | "dark";

export const LAMPLIGHT_START_HOUR = 20;
export const LAMPLIGHT_END_HOUR = 6;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark";
}

/** Old builds stored "system"; it becomes Automatic. */
export function normaliseThemePreference(value: unknown): ThemePreference {
  if (isThemePreference(value)) return value;
  return "auto";
}

export function isLamplightHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= LAMPLIGHT_START_HOUR || hour < LAMPLIGHT_END_HOUR;
}

export function resolveDark(preference: ThemePreference, date: Date = new Date()): boolean {
  if (preference === "dark") return true;
  if (preference === "light") return false;
  return isLamplightHour(date);
}

// --- Study-session lock ----------------------------------------------------

let activeSessions = 0;
let pendingApply = false;

/** Called by flashcard, quiz and exam runners while a session is open. */
export function beginStudySession(): () => void {
  activeSessions += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activeSessions = Math.max(0, activeSessions - 1);
    if (activeSessions === 0 && pendingApply) {
      pendingApply = false;
      applyTheme(getThemePreference());
    }
  };
}

export function isStudySessionActive() {
  return activeSessions > 0;
}

// --- Applying -----------------------------------------------------------------

export function applyTheme(preference: ThemePreference, { force = false } = {}) {
  if (typeof document === "undefined") return;
  const dark = resolveDark(preference);
  const root = document.documentElement;
  const currentlyDark = root.classList.contains("dark");
  if (!force && currentlyDark !== dark && isStudySessionActive()) {
    // Wait for the session to end rather than flipping colours mid-question.
    pendingApply = true;
    return;
  }
  root.classList.toggle("dark", dark);
  root.dataset.theme = preference;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#141B2D" : "#FBF6EC");
}

export function getThemePreference(): ThemePreference {
  try {
    const stored =
      window.localStorage.getItem(THEME_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    return normaliseThemePreference(stored);
  } catch {
    return "auto";
  }
}

export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private mode: the choice still applies for this visit.
  }
  // A choice the student just made applies straight away.
  applyTheme(preference, { force: true });
}

/**
 * Inline script for the document head, so the right theme paints before
 * React loads. Kept in sync with resolveDark above.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||localStorage.getItem('${LEGACY_THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='auto';var h=new Date().getHours();var d=t==='dark'||(t==='auto'&&(h>=${LAMPLIGHT_START_HOUR}||h<${LAMPLIGHT_END_HOUR}));document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=t}catch(e){}})()`;
