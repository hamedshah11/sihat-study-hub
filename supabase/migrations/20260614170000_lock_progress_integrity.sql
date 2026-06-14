-- Lock down progress & gamification integrity.
--
-- Problem: xp_events, streaks, quiz_attempts, chapter_progress, flashcard_reviews
-- and tutor_messages were each protected by an `FOR ALL ... USING (auth.uid() =
-- user_id)` policy. That let the BROWSER insert/update those rows directly with
-- the user's own JWT, so any student could forge XP, streaks, quiz scores and
-- chapter mastery from the devtools console — poisoning the batch leaderboard
-- and the exam-readiness signals.
--
-- Fix: these tables become READ-ONLY for normal authenticated users. All writes
-- now go through trusted server functions (src/lib/study.functions.ts) and edge
-- functions (tutor-ask) that use the service-role key, which bypasses RLS.
-- Admins keep full access so the instructor console / chapter-reset tooling
-- keeps working.
--
-- Some of these tables carry DUPLICATE policies created across earlier
-- migrations (e.g. both "own xp events" and "Own xp"), and the live database
-- may not match the repo exactly. So we drop EVERY existing policy on each
-- table dynamically before recreating the intended two.

do $$
declare
  r record;
  tbls text[] := array[
    'xp_events',
    'streaks',
    'quiz_attempts',
    'chapter_progress',
    'flashcard_reviews',
    'tutor_messages'
  ];
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = any (tbls)
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Ensure RLS is on (idempotent).
alter table public.xp_events           enable row level security;
alter table public.streaks             enable row level security;
alter table public.quiz_attempts       enable row level security;
alter table public.chapter_progress    enable row level security;
alter table public.flashcard_reviews   enable row level security;
alter table public.tutor_messages      enable row level security;

-- xp_events: own read, admin manage. No client writes.
create policy "xp own read" on public.xp_events
  for select to authenticated using (auth.uid() = user_id);
create policy "xp admin manage" on public.xp_events
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- streaks
create policy "streaks own read" on public.streaks
  for select to authenticated using (auth.uid() = user_id);
create policy "streaks admin manage" on public.streaks
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- quiz_attempts
create policy "quiz own read" on public.quiz_attempts
  for select to authenticated using (auth.uid() = user_id);
create policy "quiz admin manage" on public.quiz_attempts
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- chapter_progress
create policy "progress own read" on public.chapter_progress
  for select to authenticated using (auth.uid() = user_id);
create policy "progress admin manage" on public.chapter_progress
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- flashcard_reviews
create policy "reviews own read" on public.flashcard_reviews
  for select to authenticated using (auth.uid() = user_id);
create policy "reviews admin manage" on public.flashcard_reviews
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- tutor_messages: written only by the tutor-ask edge function (service role).
create policy "tutor own read" on public.tutor_messages
  for select to authenticated using (auth.uid() = user_id);
create policy "tutor admin manage" on public.tutor_messages
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
