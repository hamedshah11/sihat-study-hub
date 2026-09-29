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
  answers jsonb,
  chapter_breakdown jsonb,
  flagged_ids uuid[] not null default '{}'
);
create index if not exists exam_attempts_user_subject_idx on public.exam_attempts (user_id, subject_id, started_at desc);
grant select, insert, update, delete on public.exam_attempts to authenticated;
grant all on public.exam_attempts to service_role;
alter table public.exam_attempts enable row level security;
drop policy if exists "exam own read" on public.exam_attempts;
drop policy if exists "exam admin manage" on public.exam_attempts;
drop policy if exists "exam staff read" on public.exam_attempts;
create policy "exam own read" on public.exam_attempts for select to authenticated using (auth.uid() = user_id);
create policy "exam admin manage" on public.exam_attempts for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "exam staff read" on public.exam_attempts for select to authenticated using (public.is_staff(auth.uid()));
notify pgrst, 'reload schema';