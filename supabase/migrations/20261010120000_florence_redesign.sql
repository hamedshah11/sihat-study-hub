-- Florence redesign (brand book v2, October 2026). Safe to re-run manually.
--
-- 1. Instant quiz feedback: each answer is locked on the issued paper before
--    the correct option is shown, so it can't be changed afterwards.
-- 2. "Report a problem" from questions and flashcards, for the faculty
--    console's "Reported by students" queue.
-- 3. Student settings: opt-in study circles and reminder preferences.
-- 4. Study circles: up to five friends, opt-in, showing only whether each
--    person studied today. Never sorted by activity, never scores.
--
-- Every new table is written only through trusted server functions using the
-- service role. Students get no direct table access.

-- 1. Locked answers -----------------------------------------------------------
alter table public.quiz_sessions
  add column if not exists locked_answers jsonb not null default '{}'::jsonb;

-- 2. Student reports ----------------------------------------------------------
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('question', 'flashcard')),
  item_id uuid not null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  reason text not null check (reason in ('wrong_answer', 'unclear', 'typo', 'outdated', 'other')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists content_reports_open_idx
  on public.content_reports (status, created_at desc);
create index if not exists content_reports_chapter_idx
  on public.content_reports (chapter_id, status);
create index if not exists content_reports_user_created_idx
  on public.content_reports (user_id, created_at desc);

alter table public.content_reports enable row level security;
revoke all on table public.content_reports from public, anon, authenticated;
grant all on table public.content_reports to service_role;
-- Faculty read and resolve reports from the console (RLS: staff only).
grant select, update (status, resolved_by, resolved_at) on table public.content_reports to authenticated;

drop policy if exists "Staff read reports" on public.content_reports;
create policy "Staff read reports" on public.content_reports
  for select to authenticated using (public.is_staff(auth.uid()));

drop policy if exists "Staff resolve reports" on public.content_reports;
create policy "Staff resolve reports" on public.content_reports
  for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 3. Student settings ---------------------------------------------------------
create table if not exists public.student_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_in_circles boolean not null default false,
  reminder_enabled boolean not null default false,
  reminder_time text not null default '21:00' check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  whatsapp_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.student_settings enable row level security;
revoke all on table public.student_settings from public, anon, authenticated;
grant all on table public.student_settings to service_role;

-- 4. Study circles ------------------------------------------------------------
create table if not exists public.study_circles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.study_circle_members (
  circle_id uuid not null references public.study_circles(id) on delete cascade,
  -- One circle per student keeps it small and simple.
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create index if not exists study_circle_members_circle_idx
  on public.study_circle_members (circle_id, joined_at);

alter table public.study_circles enable row level security;
alter table public.study_circle_members enable row level security;
revoke all on table public.study_circles from public, anon, authenticated;
revoke all on table public.study_circle_members from public, anon, authenticated;
grant all on table public.study_circles to service_role;
grant all on table public.study_circle_members to service_role;

-- A circle holds the student who set it up plus up to five friends.
create or replace function public.enforce_circle_size()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1 from public.study_circles where id = new.circle_id for update;
  if (select count(*) from public.study_circle_members where circle_id = new.circle_id) >= 6 then
    raise exception 'circle_full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists study_circle_members_size on public.study_circle_members;
create trigger study_circle_members_size
  before insert on public.study_circle_members
  for each row execute function public.enforce_circle_size();
