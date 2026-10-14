import { reportClientError } from "@/lib/client-errors.functions";

// Sends errors from students' phones to client_errors so staff see them on
// /admin/diagnostics without anyone having to report them. Best effort: at
// most a handful per page load, the same message once, nothing while offline,
// and a failure to report is swallowed.

export const APP_VERSION = "1.0";

const MAX_PER_LOAD = 8;
const sent = new Set<string>();

// Noise browsers raise that isn't a bug in Florence.
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
  /AbortError/i,
];

function describe(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: `${reason.name}: ${reason.message}`, stack: reason.stack };
  }
  if (typeof reason === "string") return { message: reason };
  try {
    return { message: JSON.stringify(reason).slice(0, 500) };
  } catch {
    return { message: String(reason) };
  }
}

export function reportError(kind: "render" | "error" | "unhandled", reason: unknown) {
  if (typeof window === "undefined") return;
  if (navigator.onLine === false) return;
  const { message, stack } = describe(reason);
  if (!message || IGNORE.some((re) => re.test(message))) return;
  const key = `${kind}:${message}`;
  if (sent.has(key) || sent.size >= MAX_PER_LOAD) return;
  sent.add(key);
  void reportClientError({
    data: {
      kind,
      message: message.slice(0, 1000),
      stack: stack?.slice(0, 4000),
      path: window.location.pathname.slice(0, 300),
      userAgent: navigator.userAgent.slice(0, 300),
      appVersion: APP_VERSION,
    },
  }).catch(() => {});
}

/** Call once, from the root component. Returns a clean-up function. */
export function installErrorReporting() {
  const onError = (e: ErrorEvent) => reportError("error", e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportError("unhandled", e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
