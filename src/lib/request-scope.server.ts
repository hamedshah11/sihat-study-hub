import { AsyncLocalStorage } from "node:async_hooks";

// Per-request scope for work that should finish after the response is sent
// (Cloudflare's ctx.waitUntil). src/server.ts opens it for every request;
// TanStack Start doesn't pass the Workers context through to middleware.

type RequestScope = { waitUntil: (work: Promise<unknown>) => void };

const scope = new AsyncLocalStorage<RequestScope>();

export function withRequestScope<T>(ctx: unknown, run: () => T): T {
  const runtime = ctx as { waitUntil?: (work: Promise<unknown>) => void } | null | undefined;
  const waitUntil =
    typeof runtime?.waitUntil === "function"
      ? (work: Promise<unknown>) => runtime.waitUntil!(work)
      : // Outside Workers (vite dev) the promise just runs on.
        (work: Promise<unknown>) => void work.catch(() => undefined);
  return scope.run({ waitUntil }, run);
}

/** Finish `work` after the response, without delaying it. */
export function afterResponse(work: Promise<unknown>) {
  const current = scope.getStore();
  const guarded = work.catch((error) => console.warn("after-response work failed", error));
  if (current) current.waitUntil(guarded);
}
