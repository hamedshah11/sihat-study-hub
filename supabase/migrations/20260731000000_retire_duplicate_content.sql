-- Retire exact-duplicate questions and flashcards created by the chapter
-- top-up generation runs (30->60 MCQs, 50->100 flashcards), which were not
-- shown the existing items and re-asked many of them word-for-word.
--
-- ============================= DO NOT DELETE =============================
-- flashcard_reviews.flashcard_id references flashcards(id) ON DELETE CASCADE.
-- Deleting a flashcard therefore destroys every student's FSRS review history
-- for that card, permanently. The same style of hazard applies in spirit to
-- questions (quiz_attempts.answers reference question ids). Setting
-- status = 'rejected' removes an item from circulation just as effectively
-- (students only ever see status = 'approved'), is reversible, and preserves
-- all review history. Do NOT "optimise" these UPDATEs into DELETEs.
-- =========================================================================
--
-- Dedupe key: lower-cased prompt/front with all non-alphanumeric runs
-- collapsed to single spaces and trimmed, partitioned by chapter_id.
--
-- Keeper: within each duplicate group, the row ordered first by
-- (status = 'approved') DESC, created_at ASC, id ASC survives — the approved,
-- instructor-signed-off copy always wins. Every other row becomes 'rejected'.
--
-- Idempotent: rows already at status = 'rejected' are excluded from the input
-- set entirely, so after the first run every remaining group has exactly one
-- (kept) member and a re-run updates 0 rows.
--
-- Near-duplicates (reworded stems) are intentionally NOT handled here; those
-- need human judgement and are reviewed separately.

-- Questions: dedupe on normalised prompt within each chapter.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        chapter_id,
        trim(regexp_replace(lower(prompt), '[^a-z0-9]+', ' ', 'g'))
      order by
        (status = 'approved') desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from public.questions
  where status is distinct from 'rejected'
)
update public.questions q
set status = 'rejected'
from ranked r
where q.id = r.id
  and r.rn > 1;

-- Flashcards: dedupe on normalised front within each chapter.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        chapter_id,
        trim(regexp_replace(lower(front), '[^a-z0-9]+', ' ', 'g'))
      order by
        (status = 'approved') desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from public.flashcards
  where status is distinct from 'rejected'
)
update public.flashcards f
set status = 'rejected'
from ranked r
where f.id = r.id
  and r.rn > 1;
