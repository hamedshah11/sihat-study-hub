import { describe, expect, it } from "vitest";
import { displayStreak, nextStreak, studyDay } from "./streak";

describe("studyDay", () => {
  it("counts a session after midnight PKT for the day before", () => {
    // 01:30 PKT on 11 Oct = 20:30 UTC on 10 Oct
    expect(studyDay(new Date("2026-10-10T20:30:00Z"))).toBe("2026-10-10");
  });

  it("starts the new study day at 4 am PKT", () => {
    // 03:59 PKT -> still the 10th; 04:00 PKT -> the 11th
    expect(studyDay(new Date("2026-10-10T22:59:00Z"))).toBe("2026-10-10");
    expect(studyDay(new Date("2026-10-10T23:00:00Z"))).toBe("2026-10-11");
  });

  it("treats morning and evening study on the same date as one day", () => {
    const morning = studyDay(new Date("2026-10-11T04:00:00Z")); // 09:00 PKT
    const evening = studyDay(new Date("2026-10-11T17:00:00Z")); // 22:00 PKT
    expect(morning).toBe(evening);
  });
});

describe("days in a row", () => {
  const row = {
    current_streak: 6,
    longest_streak: 6,
    last_active_date: "2026-10-08",
    freezes_available: 1,
  };

  it("forgives one missed day without resetting", () => {
    const next = nextStreak(row, "2026-10-10");
    expect(next?.current_streak).toBe(7);
    expect(next?.usedFreeze).toBe(true);
    expect(displayStreak(row, "2026-10-10")).toBe(6);
  });

  it("starts again after more than one missed day", () => {
    expect(nextStreak(row, "2026-10-11")?.current_streak).toBe(1);
    expect(displayStreak(row, "2026-10-11")).toBe(0);
  });
});
