// Browser clocks for tests that depend on the time of day. Times are Pakistan
// Standard Time (UTC+5, no DST), the timezone the tests run the browser in.
//
// Always the most recent such time, never a future one: a browser clock ahead
// of the real one would make the student's session token look expired.

const PKT_OFFSET = 5 * 3_600_000;

/** The latest moment at `hour:minute` PKT that is not in the future. */
export function latestPkt(hour: number, minute = 0): Date {
  const now = Date.now();
  const pkt = new Date(now + PKT_OFFSET);
  const today =
    Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate(), hour, minute) - PKT_OFFSET;
  return new Date(today <= now ? today : today - 86_400_000);
}
