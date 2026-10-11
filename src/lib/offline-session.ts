import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Signing in without signal. supabase-js refreshes an expired access token
// (they last an hour) when the app starts; with no network that refresh
// fails, getSession() returns no session and the app used to send the
// student to /login. The session is still stored on the phone, so offline we
// trust it: the student can read their downloads. Once the signal is back,
// `verifySessionOnline` refreshes it properly, and a session the server
// rejects signs out as usual.

/** True when the browser says there's no connection. */
export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** supabase-js keeps the session in localStorage under sb-<project ref>-auth-token. */
export function sessionStorageKey(supabaseUrl: string) {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

function jwtSubject(token: unknown): string | null {
  if (typeof token !== "string") return null;
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

/** The user id in a stored supabase-js session, or null if it isn't one. */
export function userIdFromStoredSession(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as {
      refresh_token?: unknown;
      access_token?: unknown;
      user?: { id?: unknown } | null;
    };
    // Without a refresh token the session can never be renewed: not a session.
    if (typeof session?.refresh_token !== "string" || !session.refresh_token) return null;
    const id = session.user?.id;
    return typeof id === "string" && id ? id : jwtSubject(session.access_token);
  } catch {
    return null;
  }
}

/**
 * Forget the session stored on this phone, without asking the server. For
 * logging out offline: supabase-js first tries to refresh an expired access
 * token, and with no signal it gives up without removing the session.
 */
export function forgetStoredSession() {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) return;
    const key = sessionStorageKey(url);
    for (const suffix of ["", "-user", "-code-verifier"]) localStorage.removeItem(key + suffix);
  } catch {
    // No storage to clear.
  }
}

/** The signed-in user stored on this phone, without asking the server. */
export function storedSessionUserId(): string | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) return null;
    return userIdFromStoredSession(localStorage.getItem(sessionStorageKey(url)));
  } catch {
    return null;
  }
}

export type SessionCheck = {
  userId: string | null;
  /** True when the user comes from the stored session because the network is down. */
  trustedOffline: boolean;
};

/** How long to wait for supabase-js before trusting the stored session. */
const SLOW_SESSION_MS = 4_000;

function trustStored(): SessionCheck | null {
  const userId = storedSessionUserId();
  return userId ? { userId, trustedOffline: true } : null;
}

/** Who is signed in: the live session, or offline the one stored on the phone. */
export async function resolveSession(): Promise<SessionCheck> {
  // With an expired access token, supabase-js keeps retrying the refresh for
  // up to 30 seconds before getSession() answers. Offline, don't wait for it.
  if (isOffline()) {
    const stored = trustStored();
    if (stored) return stored;
  }
  const live = supabase.auth.getSession().then(({ data, error }): SessionCheck => {
    if (data.session) return { userId: data.session.user.id, trustedOffline: false };
    // A network failure while refreshing leaves the session in storage.
    if (isOffline() || isAuthRetryableFetchError(error)) {
      return trustStored() ?? { userId: null, trustedOffline: false };
    }
    return { userId: null, trustedOffline: false };
  });
  // Connected but nothing answering: don't keep the student waiting either.
  // supabase-js reports the outcome later (TOKEN_REFRESHED, or SIGNED_OUT).
  const slow = new Promise<null>((resolve) => setTimeout(() => resolve(null), SLOW_SESSION_MS));
  return (await Promise.race([live, slow])) ?? trustStored() ?? live;
}

/**
 * Back online after trusting the stored session: refresh it and ask the
 * server who it belongs to. A session the server rejects is signed out on
 * this phone (which sends the student to /login); a network error leaves it
 * trusted until the next try.
 */
export async function verifySessionOnline(): Promise<SessionCheck> {
  const check = await resolveSession();
  if (!check.userId || check.trustedOffline) return check;
  const { data, error } = await supabase.auth.getUser();
  if (data.user) return { userId: data.user.id, trustedOffline: false };
  if (isAuthApiError(error) && [401, 403, 404].includes(error.status ?? 0)) {
    await supabase.auth.signOut({ scope: "local" });
    return { userId: null, trustedOffline: false };
  }
  return check;
}
