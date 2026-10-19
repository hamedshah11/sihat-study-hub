// The privacy notice (/privacy) and the student's agreement to it.
//
// Agreement is stored on the auth user's metadata (privacy_version and
// privacy_accepted_at): new students tick the box on "Join your batch" and it
// travels with signInWithOtp; anyone signed in without the current version
// sees ConsentGate once (AppShell) and agrees there. Bump PRIVACY_VERSION when
// the notice changes in a way students should agree to again.

export const PRIVACY_VERSION = 1;
export const PRIVACY_UPDATED = "14 October 2026";

/**
 * Where students write about their data. Shown on /privacy when set. Leave it
 * empty until there is a real inbox; the page then points to the class
 * coordinator instead.
 */
export const PRIVACY_CONTACT_EMAIL = "";

/** Days client_errors rows are kept (see client-errors.functions.ts). */
export const ERROR_LOG_DAYS = 30;

export function consentMetadata() {
  return {
    privacy_version: PRIVACY_VERSION,
    privacy_accepted_at: new Date().toISOString(),
  };
}

export function hasCurrentConsent(metadata: Record<string, unknown> | null | undefined) {
  const v = metadata?.privacy_version;
  return typeof v === "number" && v >= PRIVACY_VERSION;
}
