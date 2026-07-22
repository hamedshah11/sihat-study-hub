import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedule, type ReviewState } from "./spacedRepetition";

// Simulates the save/load cycle through flashcard_reviews (JSON-safe row).
const roundTrip = (s: ReviewState): ReviewState => JSON.parse(JSON.stringify(s));

describe("schedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a new card rated Again due within minutes, not days", () => {
    vi.setSystemTime(new Date("2026-07-22T10:00:00Z"));
    const s = schedule(null, "again");
    const dueInMs = new Date(s.due_at).getTime() - Date.now();
    expect(s.state).toBe("learning");
    expect(dueInMs).toBeGreaterThan(0);
    expect(dueInMs).toBeLessThanOrEqual(30 * 60_000);
  });

  it("produces strictly increasing intervals across four Good reviews", () => {
    vi.setSystemTime(new Date("2026-07-22T10:00:00Z"));
    let prev: ReviewState | null = null;
    let lastInterval = 0;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const next: ReviewState = schedule(prev ? roundTrip(prev) : null, "good");
      const interval = new Date(next.due_at).getTime() - Date.now();
      intervals.push(interval);
      expect(interval).toBeGreaterThan(lastInterval);
      lastInterval = interval;
      // Review again exactly when the card comes due.
      vi.setSystemTime(new Date(next.due_at));
      prev = next;
    }
    expect(intervals).toHaveLength(4);
  });

  it("preserves learning_steps across a save/load cycle", () => {
    vi.setSystemTime(new Date("2026-07-22T10:00:00Z"));
    const s1 = schedule(null, "again"); // learning, step 0
    const s2 = schedule(roundTrip(s1), "good"); // advances to step 1
    expect(s2.state).toBe("learning");
    expect(s2.learning_steps).toBe(1);

    const restored = roundTrip(s2);
    expect(restored.learning_steps).toBe(1);

    // With the step index restored, the next Good graduates to review…
    const graduated = schedule(restored, "good");
    expect(graduated.state).toBe("review");

    // …whereas resetting learning_steps to 0 on reload (the old behaviour)
    // keeps the card stuck in learning.
    const stuck = schedule({ ...restored, learning_steps: 0 }, "good");
    expect(stuck.state).toBe("learning");
  });

  it("schedules a 02:00 Asia/Karachi review against the correct local day", () => {
    // 2026-07-21T21:00Z is 02:00 on 22 July in Karachi (UTC+5).
    const now = new Date("2026-07-21T21:00:00Z");
    vi.setSystemTime(now);
    const prev: ReviewState = {
      reps: 5,
      lapses: 0,
      state: "review",
      stability: 10,
      difficulty: 5,
      scheduled_days: 10,
      elapsed_days: 10,
      learning_steps: 0,
      last_review: new Date(now.getTime() - 10 * 86_400_000).toISOString(),
      due_at: now.toISOString(),
      next_review_at: "2026-07-22",
    };
    const next = schedule(prev, "good");
    const due = new Date(next.due_at);

    // The full timestamp preserves the time of day: the card comes due
    // exactly scheduled_days later, at 02:00 Karachi time again.
    expect(due.getTime() - now.getTime()).toBe(next.scheduled_days * 86_400_000);

    // The PKT calendar day is 22 July + interval. The old code truncated the
    // UTC date, which is one local day earlier for a review after 19:00 UTC.
    const pktDate = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
    const expectedDay = new Date(Date.UTC(2026, 6, 22 + next.scheduled_days))
      .toISOString()
      .slice(0, 10);
    expect(pktDate(due)).toBe(expectedDay);
    expect(next.next_review_at).toBe(expectedDay);
    expect(next.due_at.slice(0, 10)).not.toBe(expectedDay);
  });
});
