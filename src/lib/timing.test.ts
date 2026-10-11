import { describe, expect, it } from "vitest";
import {
  callEnded,
  callStarted,
  newTracker,
  parseServerTiming,
  phoneCalls,
  serverTimingHeader,
  summarisePhoneCalls,
  timingFrom,
  timingLogLine,
} from "./timing";

describe("Supabase call tracking", () => {
  it("counts requests made one after another as separate waits", () => {
    const t = newTracker();
    const a = callStarted(t, 0);
    callEnded(t, a, 100);
    const b = callStarted(t, 100);
    callEnded(t, b, 180);
    expect(t.calls).toBe(2);
    expect(t.waits).toBe(2);
    expect(t.busyMs).toBe(180);
  });

  it("counts requests made together as one wait", () => {
    const t = newTracker();
    const a = callStarted(t, 0);
    const b = callStarted(t, 1);
    const c = callStarted(t, 2);
    callEnded(t, b, 90);
    callEnded(t, a, 100);
    callEnded(t, c, 120);
    expect(t.calls).toBe(3);
    expect(t.waits).toBe(1);
    expect(t.busyMs).toBe(120);
  });

  it("finds a chain that runs alongside one long request", () => {
    // A long read stays in flight while two short ones run in turn.
    const t = newTracker();
    const long = callStarted(t, 0);
    const first = callStarted(t, 5);
    callEnded(t, first, 50);
    const second = callStarted(t, 50);
    callEnded(t, second, 95);
    callEnded(t, long, 300);
    expect(t.calls).toBe(3);
    expect(t.waits).toBe(2);
    expect(t.busyMs).toBe(300);
  });

  it("chains a request only behind the ones that finished before it started", () => {
    const t = newTracker();
    const a = callStarted(t, 0);
    const b = callStarted(t, 0);
    callEnded(t, a, 50);
    const c = callStarted(t, 50); // after a: depth 2
    callEnded(t, b, 60);
    const d = callStarted(t, 60); // after a and b, but c is still running: depth 2
    callEnded(t, c, 100);
    callEnded(t, d, 110);
    const e = callStarted(t, 110); // after c and d: depth 3
    callEnded(t, e, 150);
    expect(t.waits).toBe(3);
    expect(t.busyMs).toBe(150);
  });

  it("leaves busy time alone for gaps with nothing in flight", () => {
    const t = newTracker();
    const a = callStarted(t, 0);
    callEnded(t, a, 40);
    const b = callStarted(t, 100);
    callEnded(t, b, 130);
    expect(t.busyMs).toBe(70);
  });

  it("counts a request still in flight up to now", () => {
    const t = newTracker();
    callStarted(t, 10);
    expect(timingFrom("x", 50, t, true, 50).supabaseMs).toBe(40);
  });
});

describe("Server-Timing", () => {
  const timing = timingFrom(
    "getProgressSnapshot",
    182.44,
    { calls: 9, waits: 3, finishedDepth: 3, inFlight: 0, busySince: 0, busyMs: 150.06 },
    true,
  );

  it("writes the function, its time and its Supabase requests", () => {
    expect(serverTimingHeader(timing)).toBe(
      'fn;desc="getProgressSnapshot";dur=182.4, supabase;desc="9 calls, 3 waits";dur=150.1',
    );
  });

  it("reads back what the browser exposes", () => {
    expect(
      parseServerTiming([
        { name: "fn", duration: 182.4, description: "getProgressSnapshot" },
        { name: "supabase", duration: 150.1, description: "9 calls, 3 waits" },
      ]),
    ).toEqual({
      fn: "getProgressSnapshot",
      serverMs: 182.4,
      supabaseCalls: 9,
      supabaseWaits: 3,
      supabaseMs: 150.1,
    });
    expect(parseServerTiming([])).toBeNull();
  });

  it("keeps anything but a function name out of the header", () => {
    const odd = { ...timing, fn: 'evil";dur=1, x' };
    expect(serverTimingHeader(odd)).toMatch(/^fn;desc="evildur1x";/);
  });

  it("logs numbers and the function name only", () => {
    expect(JSON.parse(timingLogLine(timing))).toEqual({
      event: "server_fn",
      fn: "getProgressSnapshot",
      ms: 182.4,
      supabase_calls: 9,
      supabase_waits: 3,
      supabase_ms: 150.1,
      ok: true,
    });
  });
});

describe("timings on the phone", () => {
  const entry = (
    fn: string,
    startTime: number,
    duration: number,
    server: number,
    waits: number,
  ) => ({
    name: `https://florence.example/_serverFn/abc?fn=${fn}`,
    startTime,
    duration,
    serverTiming: [
      { name: "fn", duration: server, description: fn },
      { name: "supabase", duration: server - 5, description: `4 calls, ${waits} waits` },
    ],
  });

  it("keeps server-function calls with our header, newest first", () => {
    const calls = phoneCalls(
      [
        entry("getProgressSnapshot", 100, 900.4, 300.2, 2),
        { name: "https://florence.example/assets/app.js", startTime: 50, duration: 80 },
        {
          name: "https://florence.example/_serverFn/old",
          startTime: 60,
          duration: 80,
          serverTiming: [],
        },
        entry("recordReview", 2000, 400, 120, 2),
      ],
      1_000_000,
    );
    expect(calls).toEqual([
      { fn: "recordReview", startedAt: 1_002_000, totalMs: 400, serverMs: 120, supabaseWaits: 2 },
      {
        fn: "getProgressSnapshot",
        startedAt: 1_000_100,
        totalMs: 900,
        serverMs: 300,
        supabaseWaits: 2,
      },
    ]);
  });

  it("gives typical times per function, slowest first", () => {
    const calls = phoneCalls([
      entry("recordReview", 1, 300, 100, 2),
      entry("recordReview", 2, 500, 140, 2),
      entry("recordReview", 3, 400, 120, 3),
      entry("getProgressSnapshot", 4, 900, 300, 2),
    ]);
    expect(summarisePhoneCalls(calls)).toEqual([
      { fn: "getProgressSnapshot", calls: 1, totalMs: 900, serverMs: 300, supabaseWaits: 2 },
      { fn: "recordReview", calls: 3, totalMs: 400, serverMs: 120, supabaseWaits: 2 },
    ]);
  });
});
