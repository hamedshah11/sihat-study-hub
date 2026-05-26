
-- Drop existing conflicting tables
drop table if exists public.user_roles cascade;
drop table if exists public.streaks cascade;
drop table if exists public.profiles cascade;
drop table if exists public.invite_codes cascade;
drop table if exists public.batches cascade;
drop table if exists public.chapters cascade;
drop table if exists public.subjects cascade;
drop table if exists public.semesters cascade;
drop type if exists public.chapter_status cascade;
drop type if exists public.student_type cascade;
drop type if exists public.app_role cascade;
drop trigger if exists on_auth_user_created on auth.users;

-- 1. PROGRAMS
create table programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_semesters int not null default 8,
  created_at timestamptz default now()
);

-- 2. SEMESTERS
create table semesters (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade,
  number int not null,
  name text not null,
  created_at timestamptz default now()
);

-- 3. BATCHES
create table batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  program_id uuid references programs(id),
  current_semester_id uuid references semesters(id),
  start_date date,
  created_at timestamptz default now()
);

-- 4. INVITE CODES
create table invite_codes (
  code text primary key,
  batch_id uuid references batches(id) on delete cascade,
  max_uses int default 100,
  used_count int default 0,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- 5. SUBJECTS
create table subjects (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid references semesters(id) on delete cascade,
  name text not null,
  description text,
  icon text,
  display_order int default 0,
  created_at timestamptz default now()
);

-- 6. CHAPTERS
create table chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id) on delete cascade,
  title text not null,
  summary_md text,
  display_order int default 0,
  status text default 'draft' check (status in ('draft', 'in_review', 'published')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. PROFILES
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  role text default 'student' check (role in ('student', 'instructor', 'admin')),
  student_type text check (student_type in ('internal', 'external')),
  batch_id uuid references batches(id),
  created_at timestamptz default now()
);

-- 8. QUESTIONS
create table questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  correct_index int not null,
  explanation text,
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  status text default 'draft' check (status in ('draft', 'approved', 'rejected')),
  created_at timestamptz default now()
);

-- 9. FLASHCARDS
create table flashcards (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id) on delete cascade,
  front text not null,
  back text not null,
  hint text,
  card_type text default 'basic' check (card_type in ('basic', 'cloze')),
  status text default 'draft' check (status in ('draft', 'approved', 'rejected')),
  created_at timestamptz default now()
);

-- 10. FLASHCARD REVIEWS
create table flashcard_reviews (
  user_id uuid references auth.users(id) on delete cascade,
  flashcard_id uuid references flashcards(id) on delete cascade,
  stability numeric default 0,
  difficulty numeric default 5,
  elapsed_days int default 0,
  scheduled_days int default 0,
  reps int default 0,
  lapses int default 0,
  state text default 'new' check (state in ('new', 'learning', 'review', 'relearning')),
  last_review timestamptz,
  next_review_at date,
  primary key (user_id, flashcard_id)
);

-- 11. QUIZ ATTEMPTS
create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete cascade,
  score numeric not null,
  total_questions int not null,
  answers jsonb,
  attempted_at timestamptz default now()
);

-- 12. CHAPTER PROGRESS
create table chapter_progress (
  user_id uuid references auth.users(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete cascade,
  mastery_score numeric default 0,
  attempts int default 0,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  primary key (user_id, chapter_id)
);

-- 13. TUTOR MESSAGES
create table tutor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  chapter_id uuid references chapters(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- 14. STREAKS
create table streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak int default 0,
  longest_streak int default 0,
  last_active_date date,
  freezes_available int default 1
);

-- 15. XP EVENTS
create table xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount int not null,
  source text,
  occurred_at timestamptz default now()
);

-- Helper: is_admin (security definer to avoid recursion on profiles)
create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = _user_id and role = 'admin')
$$;

-- Profile auto-create
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles/streaks for any existing auth users
insert into public.profiles (id, email, display_name)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

insert into public.streaks (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ========== RLS ==========
alter table programs enable row level security;
alter table semesters enable row level security;
alter table batches enable row level security;
alter table invite_codes enable row level security;
alter table subjects enable row level security;
alter table chapters enable row level security;
alter table profiles enable row level security;
alter table questions enable row level security;
alter table flashcards enable row level security;
alter table flashcard_reviews enable row level security;
alter table quiz_attempts enable row level security;
alter table chapter_progress enable row level security;
alter table tutor_messages enable row level security;
alter table streaks enable row level security;
alter table xp_events enable row level security;

-- Public-ish course content: any signed-in user can read
create policy "auth read programs" on programs for select to authenticated using (true);
create policy "auth read semesters" on semesters for select to authenticated using (true);
create policy "auth read batches" on batches for select to authenticated using (true);
create policy "auth read subjects" on subjects for select to authenticated using (true);
create policy "auth read published chapters" on chapters for select to authenticated
  using (status = 'published' or public.is_admin(auth.uid()));
create policy "auth read approved questions" on questions for select to authenticated
  using (status = 'approved' or public.is_admin(auth.uid()));
create policy "auth read approved flashcards" on flashcards for select to authenticated
  using (status = 'approved' or public.is_admin(auth.uid()));

-- Admin manage course content
create policy "admin manage programs" on programs for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin manage semesters" on semesters for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin manage batches" on batches for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin manage subjects" on subjects for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin manage chapters" on chapters for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin manage questions" on questions for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin manage flashcards" on flashcards for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin manage invite codes" on invite_codes for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Profiles
create policy "users read own profile" on profiles for select to authenticated using (auth.uid() = id or public.is_admin(auth.uid()));
create policy "users update own profile" on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "admin manage profiles" on profiles for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Per-user tables: user owns their rows
create policy "own flashcard reviews" on flashcard_reviews for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own quiz attempts" on quiz_attempts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own chapter progress" on chapter_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tutor messages" on tutor_messages for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own streaks" on streaks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own xp events" on xp_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========== SEED ==========
do $$
declare
  prog_id uuid;
  sem1_id uuid;
  sem2_id uuid;
  b_id uuid;
begin
  insert into programs (name) values ('Bachelor of Science in Nursing') returning id into prog_id;

  insert into semesters (program_id, number, name) values (prog_id, 1, 'Semester 1') returning id into sem1_id;
  insert into semesters (program_id, number, name) values (prog_id, 2, 'Semester 2') returning id into sem2_id;
  insert into semesters (program_id, number, name)
    select prog_id, n, 'Semester ' || n from generate_series(3, 8) as n;

  insert into batches (name, program_id, current_semester_id, start_date)
  values ('Batch 2024 January', prog_id, sem1_id, '2024-01-15') returning id into b_id;
  insert into batches (name, program_id, current_semester_id, start_date)
  values ('Batch 2024 September', prog_id, sem2_id, '2024-09-01');

  insert into invite_codes (code, batch_id, max_uses)
  values ('SI-BSN-2024-A', b_id, 60);
end $$;
