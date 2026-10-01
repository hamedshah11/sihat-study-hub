// Shared atomic XP + streak award for edge functions.
// The database RPC fixes amounts server-side at each caller and deduplicates by
// a deterministic activity key while updating the streak in the same transaction.

export const XP_AMOUNTS = {
  flashcard: 1,
  quiz: 10,
  quiz_pass: 15,
  tutor: 2,
  exam: 20,
  exam_pass: 35,
  review: 10,
} as const;
export type XpSource = keyof typeof XP_AMOUNTS;

// deno-lint-ignore no-explicit-any
export async function awardXpAndStreak(
  admin: any,
  userId: string,
  source: XpSource,
  idempotencyKey: string,
): Promise<number> {
  const { data, error } = await admin.rpc("record_activity", {
    p_user_id: userId,
    p_source: source,
    p_amount: XP_AMOUNTS[source],
    p_idempotency_key: idempotencyKey,
    p_award_xp: true,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
