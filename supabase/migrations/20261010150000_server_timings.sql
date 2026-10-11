-- Server-function timings for /admin/diagnostics. Safe to re-run manually.
--
-- One row per server-function call: the function's name, how long it took,
-- and how many Supabase requests it made (and how many of those it had to
-- wait for one after another). No user ids, names or answers. The app keeps
-- about three days and prunes older rows itself.
--
-- Written only by trusted server code (service role). Staff read a summary
-- through a server function; nothing is readable from the browser.

create table if not exists public.server_timings (
  id bigint generated always as identity primary key,
  fn text not null check (char_length(fn) between 1 and 100),
  duration_ms integer not null check (duration_ms >= 0),
  supabase_calls smallint not null default 0 check (supabase_calls >= 0),
  supabase_waits smallint not null default 0 check (supabase_waits >= 0),
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists server_timings_created_idx
  on public.server_timings (created_at);

alter table public.server_timings enable row level security;
revoke all on table public.server_timings from public, anon, authenticated;
grant all on table public.server_timings to service_role;

-- Typical (median), slow (95th percentile) and slowest times per function
-- since a given moment.
create or replace function public.server_timing_summary(p_since timestamptz)
returns table (
  fn text,
  calls bigint,
  failures bigint,
  median_ms double precision,
  p95_ms double precision,
  max_ms integer,
  median_supabase_calls double precision,
  median_supabase_waits double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.fn,
    count(*) as calls,
    count(*) filter (where not t.ok) as failures,
    percentile_cont(0.5) within group (order by t.duration_ms) as median_ms,
    percentile_cont(0.95) within group (order by t.duration_ms) as p95_ms,
    max(t.duration_ms) as max_ms,
    percentile_cont(0.5) within group (order by t.supabase_calls) as median_supabase_calls,
    percentile_cont(0.5) within group (order by t.supabase_waits) as median_supabase_waits
  from public.server_timings t
  where t.created_at >= p_since
  group by t.fn
  order by percentile_cont(0.95) within group (order by t.duration_ms) desc;
$$;

revoke all on function public.server_timing_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.server_timing_summary(timestamptz) to service_role;
