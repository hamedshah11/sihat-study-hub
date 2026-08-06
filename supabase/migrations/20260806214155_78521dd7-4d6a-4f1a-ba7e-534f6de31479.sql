ALTER TABLE public.flashcard_reviews
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS learning_steps integer;

UPDATE public.flashcard_reviews SET due_at = next_review_at WHERE due_at IS NULL;