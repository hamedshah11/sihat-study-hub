import { createMiddleware } from "@tanstack/react-start";
import { timeServerFn } from "@/lib/timing.server";

/**
 * Global function middleware (registered first in src/start.ts, so it wraps
 * auth and the handler): times every server function. See timing.server.ts.
 */
export const serverTiming = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => timeServerFn(serverFnMeta?.name ?? "unknown", () => next()),
);
