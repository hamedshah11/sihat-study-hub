import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { clearRecordedCalls, recordedCalls } from "@/lib/phone-speed";
import { summarisePhoneCalls, type PhoneCall } from "@/lib/timing";

// Server-function timings as this phone saw them: the browser times every
// request, and each server function adds a Server-Timing header with its own
// time (recorded per tab by src/lib/phone-speed.ts). Total minus server is
// the mobile network and the phone. Nothing leaves the phone unless "Copy as
// text" is used.

function asText(calls: PhoneCall[]) {
  const lines = summarisePhoneCalls(calls).map(
    (s) =>
      `${s.fn}: ${s.calls} calls, typical ${s.totalMs} ms on the phone, ${s.serverMs} ms on the server, ${s.supabaseWaits ?? "?"} Supabase waits`,
  );
  const each = calls.map(
    (c) =>
      `${new Date(c.startedAt).toISOString().slice(11, 19)}  ${c.fn}  total ${c.totalMs} ms  server ${c.serverMs} ms  waits ${c.supabaseWaits ?? "?"}`,
  );
  return [
    `Florence speed on this phone (${new Date().toISOString()})`,
    "",
    ...lines,
    "",
    ...each,
  ].join("\n");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="fl-number text-[15px]">{value}</p>
    </div>
  );
}

export function SpeedOnThisPhone() {
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const refresh = useCallback(() => setCalls(recordedCalls()), []);
  useEffect(refresh, [refresh]);
  const summary = summarisePhoneCalls(calls);

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText(calls));
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy on this phone.");
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-display text-[20px]">On this phone</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Typical times for the server requests made in this browser tab. Total is how long the phone
        waited; server is the time Florence&apos;s server took; the difference is the mobile network
        and the phone.
      </p>
      {summary.length === 0 ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Nothing yet. Use the app in this tab (Today, a review, a quiz), then come back and
          refresh.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {summary.map((s) => (
            <li key={s.fn} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold">{s.fn}</p>
                <p className="shrink-0 text-[12.5px] text-muted-foreground">
                  <span className="fl-number">{s.calls}</span> {s.calls === 1 ? "call" : "calls"}
                </p>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                <Stat label="Total" value={`${s.totalMs} ms`} />
                <Stat label="Server" value={`${s.serverMs} ms`} />
                <Stat label="Network" value={`${Math.max(0, s.totalMs - s.serverMs)} ms`} />
                <Stat
                  label="Waits"
                  value={s.supabaseWaits === null ? "–" : String(s.supabaseWaits)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={refresh}
          className="h-9 rounded-full border border-border-strong px-4 text-[13px] font-semibold"
        >
          Refresh
        </button>
        {calls.length > 0 && (
          <>
            <button
              onClick={() => void copy()}
              className="h-9 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
            >
              Copy as text
            </button>
            <button
              onClick={() => {
                clearRecordedCalls();
                refresh();
              }}
              className="h-9 rounded-full border border-border-strong px-4 text-[13px] font-semibold"
            >
              Clear
            </button>
          </>
        )}
      </div>
    </section>
  );
}
