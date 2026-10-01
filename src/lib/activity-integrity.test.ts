import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("activity integrity", () => {
  const migration = readRepoFile("supabase/migrations/20261001160000_atomic_activity_awards.sql");

  it("deduplicates XP awards per user and activity key", () => {
    expect(migration).toContain("xp_events_user_idempotency_idx");
    expect(migration).toContain("(user_id, idempotency_key)");
    expect(migration).toContain("on conflict (user_id, idempotency_key)");
  });

  it("restricts the atomic activity operation to the service role", () => {
    expect(migration).toContain("service role required");
    expect(migration).toContain(
      "revoke all on function public.record_activity(uuid, text, integer, text, boolean)",
    );
  });

  it("routes trusted application activity through the atomic helper", () => {
    const study = readRepoFile("src/lib/study.functions.ts");
    const exams = readRepoFile("src/lib/exam.functions.ts");
    expect(study).not.toContain("insertXp(");
    expect(study).not.toContain("bumpStreak(");
    expect(exams).not.toContain("insertXp(");
    expect(exams).not.toContain("bumpStreak(");
    expect(study).toContain("recordActivity(");
    expect(exams).toContain("recordActivity(");
  });
});
