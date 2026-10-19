-- Pilot readiness (October 2026). Idempotent; safe to re-run.
--
-- 1. The weekly leaderboard is gone from the app (/leaderboard redirects to
--    /batch), but its database function still let any signed-in student read
--    every classmate's weekly XP ranking. Progress is private by default, so
--    the function goes.
-- 2. Profiles are created by the on_auth_user_created trigger. Nothing in the
--    app inserts a profile from the browser, and the old "insert own profile"
--    policy would let someone with no profile row create one with any role
--    (protect_profile_fields only guards UPDATE). Dropped.
-- 3. client_errors: what went wrong on students' phones (page, message, stack,
--    browser), so problems in the pilot reach staff without anyone having to
--    report them. Written only by the reportClientError server function
--    (service role); staff read it through getClientErrors on
--    /admin/diagnostics. Kept for 30 days.
--
-- Note: 20260614170000_lock_progress_integrity.sql had not been applied to the
-- live database; it was applied on 14 October 2026 together with this file.

drop function if exists public.batch_weekly_leaderboard();

drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('render', 'error', 'unhandled')),
  message text not null check (char_length(message) between 1 and 1000),
  stack text check (char_length(stack) <= 4000),
  path text check (char_length(path) <= 300),
  user_agent text check (char_length(user_agent) <= 300),
  app_version text check (char_length(app_version) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_idx on public.client_errors (created_at);
create index if not exists client_errors_user_created_idx
  on public.client_errors (user_id, created_at);

alter table public.client_errors enable row level security;
revoke all on table public.client_errors from public, anon, authenticated;
grant all on table public.client_errors to service_role;
