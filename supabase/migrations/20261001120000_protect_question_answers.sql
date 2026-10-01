-- Keep answer keys out of student-accessible PostgREST responses.
-- RLS controls rows, not columns, so approved-question policies alone cannot
-- prevent a student from explicitly selecting correct_index or explanation.

revoke select on table public.questions from authenticated;
grant select (
  id,
  chapter_id,
  prompt,
  options,
  difficulty,
  status,
  created_at
) on table public.questions to authenticated;

-- Trusted server and edge-function clients still need the full answer key.
grant all on table public.questions to service_role;

-- Bind each submission to the exact server-issued paper. There are no browser
-- policies: students interact with sessions only through authenticated server
-- functions, and cannot substitute arbitrary question IDs to reveal keys.
create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  question_ids uuid[] not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint quiz_sessions_question_count check (cardinality(question_ids) between 1 and 50)
);

create index if not exists quiz_sessions_user_created_idx
  on public.quiz_sessions (user_id, created_at desc);

alter table public.quiz_sessions enable row level security;
revoke all on table public.quiz_sessions from public, anon, authenticated;
grant all on table public.quiz_sessions to service_role;
