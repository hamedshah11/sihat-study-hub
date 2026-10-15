import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getClientErrors } from "@/lib/client-errors.functions";

// Errors from students' phones over the last 7 days, grouped by message and
// page, most frequent first. Rows come from src/lib/error-reporting.ts.

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function ClientErrors() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-client-errors"],
    queryFn: () => getClientErrors(),
  });
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-display text-[20px]">Problems on phones, last 7 days</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Errors the app hit on students&apos; phones, sent automatically. People counts signed-in
        students only.
      </p>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Couldn&apos;t load the errors. {error.message}
        </p>
      ) : !data?.available ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Error reports start once the database update 20261014090000_pilot_readiness.sql is
          applied.
        </p>
      ) : data.groups.length === 0 ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          No errors reported in the last 7 days.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {data.groups.map((g, i) => (
            <li key={`${g.message}-${g.path}`} className="py-3">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full text-left"
                aria-expanded={open === i}
              >
                <p className="break-words text-sm font-semibold">{g.message}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {g.path ?? "Unknown page"} · <span className="fl-number">{g.count}</span>{" "}
                  {g.count === 1 ? "time" : "times"} · <span className="fl-number">{g.people}</span>{" "}
                  {g.people === 1 ? "person" : "people"} · last {ago(g.lastSeen)}
                </p>
              </button>
              {open === i && (
                <div className="mt-2 space-y-2">
                  {g.userAgent && (
                    <p className="break-words text-[12px] text-muted-foreground">{g.userAgent}</p>
                  )}
                  {g.stack && (
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-[11.5px]">
                      {g.stack}
                    </pre>
                  )}
                </div>
              )}
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
