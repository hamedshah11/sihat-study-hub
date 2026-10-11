import { useQuery } from "@tanstack/react-query";
import { getServerSpeed } from "@/lib/diagnostics.functions";

// How long each server function took over the last day, for staff. From the
// rows the timing middleware saves; see src/lib/timing.server.ts.

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="fl-number text-[15px]">{value}</p>
    </div>
  );
}

export function ServerSpeed() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-server-speed"],
    queryFn: () => getServerSpeed(),
  });

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-display text-[20px]">Server, last 24 hours</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every student&apos;s requests, timed on the server. Typical is the median; slow is the
        slowest 1 in 20. Waits are Supabase requests that had to run one after another.
      </p>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Couldn&apos;t load the timings. {error.message}
        </p>
      ) : !data?.available ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Speed history starts once the server timings database update
          (20261010150000_server_timings.sql) is applied.
        </p>
      ) : data.functions.length === 0 ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          No requests in the last 24 hours.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {data.functions.map((f) => (
            <li key={f.fn} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold">{f.fn}</p>
                <p className="shrink-0 text-[12.5px] text-muted-foreground">
                  <span className="fl-number">{f.calls}</span>{" "}
                  {f.calls === 1 ? "request" : "requests"}
                  {f.failures > 0 && (
                    <>
                      {" "}
                      · <span className="fl-number">{f.failures}</span> failed
                    </>
                  )}
                </p>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                <Stat label="Typical" value={`${f.typicalMs} ms`} />
                <Stat label="Slow" value={`${f.slowMs} ms`} />
                <Stat label="Slowest" value={`${f.slowestMs} ms`} />
                <Stat label="Waits" value={String(f.supabaseWaits)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => void refetch()}
        disabled={isFetching}
        className="mt-3 h-9 rounded-full border border-border-strong px-4 text-[13px] font-semibold disabled:opacity-50"
      >
        Refresh
      </button>
    </section>
  );
}
