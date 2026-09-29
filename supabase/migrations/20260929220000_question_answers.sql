-- Per-question answer log.
--
-- One row per question a student answers, from chapter quizzes, exams and
-- mistake reviews. It drives:
--   - chapter quiz selection (due mistakes first, then unseen questions)
--   - "Fix your mistakes": a wrong answer comes back after 1 day, then once
--     more 3 days after it is answered right; two right answers clear it
--     (rules in src/lib/mistakes.ts)
--
-- READ-ONLY from the browser, like quiz_attempts: rows are written only by
-- service-role server functions (submitQuiz, submitExam, submitReview), which
-- grade answers server-side.
--
-- Safe to re-run.

create table if not exists public.question_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  correct boolean not null,
  source text not null check (source in ('quiz', 'exam', 'review')),
  answered_at timestamptz not null default now()
);

create index if not exists question_answers_user_time_idx
  on public.question_answers (user_id, answered_at desc);
create index if not exists question_answers_user_chapter_idx
  on public.question_answers (user_id, chapter_id);

grant select on public.question_answers to authenticated;
grant all on public.question_answers to service_role;

alter table public.question_answers enable row level security;

drop policy if exists "answers own read" on public.question_answers;
drop policy if exists "answers staff read" on public.question_answers;
drop policy if exists "answers admin manage" on public.question_answers;

create policy "answers own read" on public.question_answers
  for select to authenticated using (auth.uid() = user_id);
create policy "answers staff read" on public.question_answers
  for select to authenticated using (public.is_staff(auth.uid()));
create policy "answers admin manage" on public.question_answers
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Backfill from existing quiz and exam attempts, once (only while the table is
-- still empty). Unanswered exam questions are skipped: running out of time is
-- not the same as getting it wrong.
do $$
begin
  if not exists (select 1 from public.question_answers) then
    insert into public.question_answers (user_id, question_id, chapter_id, correct, source, answered_at)
    select qa.user_id,
           (a->>'questionId')::uuid,
           qa.chapter_id,
           coalesce((a->>'correct')::boolean, false),
           'quiz',
           coalesce(qa.attempted_at, now())
    from public.quiz_attempts qa
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(qa.answers) = 'array' then qa.answers else '[]'::jsonb end
    ) a
    where qa.user_id is not null
      and exists (select 1 from public.questions q where q.id = (a->>'questionId')::uuid);

    insert into public.question_answers (user_id, question_id, chapter_id, correct, source, answered_at)
    select ea.user_id,
           (a->>'questionId')::uuid,
           nullif(a->>'chapterId', '')::uuid,
           coalesce((a->>'correct')::boolean, false),
           'exam',
           ea.submitted_at
    from public.exam_attempts ea
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(ea.answers) = 'array' then ea.answers else '[]'::jsonb end
    ) a
    where ea.submitted_at is not null
      and a->>'selectedIndex' is not null
      and exists (select 1 from public.questions q where q.id = (a->>'questionId')::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
