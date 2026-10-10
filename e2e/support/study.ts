// Per-test progress set-up, through the local service-role client.

import { admin, ago, DAY, HOUR, must, reviewRow } from "./admin.ts";
import { CHAPTERS, cardId } from "./seed-data.ts";

/** Give a student `count` cards of a chapter that are due now, oldest first. */
export async function giveDueCards(
  userId: string,
  chapterId: string,
  count: number,
  { dueAgo = HOUR }: { dueAgo?: number } = {},
) {
  const chapter = CHAPTERS.find((c) => c.id === chapterId)!;
  const now = Date.now();
  await must(
    "due cards",
    admin()
      .from("flashcard_reviews")
      .insert(
        chapter.cards.slice(0, count).map((_, i) =>
          reviewRow(userId, cardId(chapterId, i), {
            now,
            lastReviewAgo: dueAgo + 3 * DAY,
            dueIn: -(dueAgo + (count - i) * 60_000),
          }),
        ),
      ),
  );
}

/**
 * Move a student's answer log back in time, as if `days` had passed. Mistakes
 * come back for review a day after they were made.
 */
export async function ageAnswers(userId: string, days: number) {
  const { data } = await admin()
    .from("question_answers")
    .select("id, answered_at")
    .eq("user_id", userId);
  for (const row of data ?? []) {
    await must(
      "age answer",
      admin()
        .from("question_answers")
        .update({ answered_at: ago(days * DAY, Date.parse(row.answered_at)) })
        .eq("id", row.id),
    );
  }
}
