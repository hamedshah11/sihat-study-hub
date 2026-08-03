-- Flashcard review precision: FSRS-6 schedules learning steps in minutes,
-- but next_review_at is a bare date truncated in UTC — that destroys sub-day
-- scheduling and lands a day early in Pakistan (UTC+5) for reviews computed
-- after 19:00 UTC. Add a full-precision due timestamp plus the FSRS-6
-- learning-step index, and backfill existing rows at Asia/Karachi midnight
-- of the old date. next_review_at stays (and is still written) until all
-- readers are migrated off it.

alter table public.flashcard_reviews
  add column if not exists due_at timestamptz,
  add column if not exists learning_steps int not null default 0;

update public.flashcard_reviews
set due_at = (next_review_at::timestamp at time zone 'Asia/Karachi')
where due_at is null
  and next_review_at is not null;

-- The home screen queries "reviews due now" per user.
create index if not exists idx_flashcard_reviews_user_due
  on public.flashcard_reviews (user_id, due_at);
