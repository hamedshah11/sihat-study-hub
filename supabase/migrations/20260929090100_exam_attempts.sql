-- Exam mode: timed, subject-wide MCQ exams with no feedback until submission.
--
-- One row per exam attempt. The row is created when the student starts the
-- exam (question set + deadline fixed server-side) and completed when they
-- submit. Like quiz_attempts, this table is READ-ONLY from the browser: all
-- writes go through the service-role server functions in
-- src/lib/exam.functions.ts, which choose the questions, grade the answers and
-- compute the per-chapter breakdown. Students can never set their own score.
--
-- Safe to re-run.

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  mode text not null check (mode in ('quick', 'full')),
  chapter_ids uuid[] not null,
  question_ids uuid[] not null,
  duration_seconds integer not null check (duration_seconds > 0),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  score integer,
  total_questions integer not null,
  -- [{ questionId, chapterId, selectedIndex (null = unanswered), correct }]
  answers jsonb,
  -- [{ chapterId, correct, total }]
  chapter_breakdown jsonb,
  -- Question ids the student flagged for review (informational only).
  flagged_ids uuid[] not null default '{}'
);

create index if not exists exam_attempts_user_subject_idx
  on public.exam_attempts (user_id, subject_id, started_at desc);

alter table public.exam_attempts enable row level security;

drop policy if exists "exam own read" on public.exam_attempts;
drop policy if exists "exam admin manage" on public.exam_attempts;

-- Own read, admin manage. No client writes (see note above).
create policy "exam own read" on public.exam_attempts
  for select to authenticated using (auth.uid() = user_id);
create policy "exam admin manage" on public.exam_attempts
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Instructors can see exam results for coaching (read-only).
drop policy if exists "exam staff read" on public.exam_attempts;
create policy "exam staff read" on public.exam_attempts
  for select to authenticated using (public.is_staff(auth.uid()));
