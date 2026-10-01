import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("question answer-key boundary", () => {
  it("grants authenticated clients only answer-free question columns", () => {
    const migration = readRepoFile(
      "supabase/migrations/20261001120000_protect_question_answers.sql",
    );
    expect(migration).toContain("revoke select on table public.questions from authenticated");
    const authenticatedGrant = migration.match(
      /grant select \(([\s\S]*?)\) on table public\.questions to authenticated/,
    )?.[1];
    expect(authenticatedGrant).toBeTruthy();
    expect(authenticatedGrant).not.toContain("correct_index");
    expect(authenticatedGrant).not.toContain("explanation");
  });

  it("does not request answer keys from student-facing question queries", () => {
    const chapterQuiz = readRepoFile("src/components/ChapterQuiz.tsx");
    const mistakeReview = readRepoFile("src/routes/_authenticated/review.tsx");
    expect(chapterQuiz).not.toContain('.from("questions")');
    expect(mistakeReview).not.toContain("correct_index");
  });

  it("keeps quiz sessions inaccessible to browser roles", () => {
    const migration = readRepoFile(
      "supabase/migrations/20261001120000_protect_question_answers.sql",
    );
    expect(migration).toContain("create table if not exists public.quiz_sessions");
    expect(migration).toContain(
      "revoke all on table public.quiz_sessions from public, anon, authenticated",
    );
    expect(migration).toContain("grant all on table public.quiz_sessions to service_role");
  });
});
