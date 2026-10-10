import { phoneCalls, type PhoneCall } from "@/lib/timing";

// Records this tab's server-function timings (from each response's
// Server-Timing header) in sessionStorage, so the speed page can show them
// even after a reload or when it is opened by typing its address. Function
// names and numbers only; it stays on the phone and goes when the tab closes.

const KEY = "florence:speed";
const MAX_CALLS = 300;

export function recordedCalls(): PhoneCall[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as PhoneCall[]) : [];
  } catch {
    return [];
  }
}

export function clearRecordedCalls() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing was recorded.
  }
}

function record(calls: PhoneCall[]) {
  if (calls.length === 0) return;
  try {
    // The same request can be reported twice (e.g. an observer started twice
    // in development); keep it once.
    const seen = new Set<string>();
    const all = [...calls, ...recordedCalls()]
      .filter((c) => {
        const key = `${c.fn}|${c.startedAt}|${c.totalMs}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.startedAt - a.startedAt);
    sessionStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_CALLS)));
  } catch {
    // Storage full or blocked: skip.
  }
}

/** Start recording; returns a function that stops. */
export function recordPhoneSpeed(): () => void {
  if (typeof PerformanceObserver === "undefined") return () => undefined;
  const observer = new PerformanceObserver((list) =>
    record(phoneCalls(list.getEntries() as PerformanceResourceTiming[], performance.timeOrigin)),
  );
  try {
    // buffered: also the requests made before the app started observing.
    observer.observe({ type: "resource", buffered: true });
  } catch {
    return () => undefined;
  }
  return () => observer.disconnect();
}
