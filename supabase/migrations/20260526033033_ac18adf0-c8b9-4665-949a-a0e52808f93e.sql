
-- Drop all existing policies on these tables
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
    and tablename in ('programs','semesters','batches','invite_codes','subjects','chapters',
                      'profiles','questions','flashcards','flashcard_reviews','quiz_attempts',
                      'chapter_progress','tutor_messages','streaks','xp_events')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Helper: is the user instructor or admin? (security definer to avoid recursion)
create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = _user_id and role in ('instructor','admin'))
$$;

-- Enable RLS
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

-- Curriculum reads
create policy "Anyone authed can read programs" on programs for select to authenticated using (true);
create policy "Anyone authed can read semesters" on semesters for select to authenticated using (true);
create policy "Anyone authed can read batches" on batches for select to authenticated using (true);
create policy "Anyone authed can read subjects" on subjects for select to authenticated using (true);

-- Chapters / questions / flashcards (status-gated)
create policy "Students see published chapters only" on chapters for select to authenticated
  using (status = 'published' or public.is_staff(auth.uid()));
create policy "Students see approved questions" on questions for select to authenticated
  using (status = 'approved' or public.is_staff(auth.uid()));
create policy "Students see approved flashcards" on flashcards for select to authenticated
  using (status = 'approved' or public.is_staff(auth.uid()));

-- Profiles (use is_staff to avoid recursion)
create policy "Users see own profile" on profiles for select to authenticated
  using (auth.uid() = id or public.is_staff(auth.uid()));
create policy "Users update own profile" on profiles for update to authenticated using (auth.uid() = id);
create policy "Users insert own profile" on profiles for insert to authenticated with check (auth.uid() = id);

-- Per-user data
create policy "Own flashcard reviews" on flashcard_reviews for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own quiz attempts" on quiz_attempts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own chapter progress" on chapter_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own tutor messages" on tutor_messages for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own streak" on streaks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own xp" on xp_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Invite codes
create policy "Authed users read invite codes" on invite_codes for select to authenticated using (true);

-- Instructor/admin authoring
create policy "Instructors write chapters" on chapters for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "Instructors write questions" on questions for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "Instructors write flashcards" on flashcards for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "Instructors write subjects" on subjects for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
