-- Chapter video resources (YouTube), curated by the curate-videos edge
-- function and approved by staff before students see them.
--
-- Follows the diagram_labels pattern (text status, approved-or-staff read,
-- touch_updated_at trigger) with two deliberate differences:
--   * Staff (instructors + admins) can manage rows, not only admins, because
--     instructors are the reviewers.
--   * There is NO delete path. Retire a video with status = 'rejected'. The
--     curation function reads rejected rows and never re-stages them, so a
--     DELETE would let a video faculty turned down come back on the next run.

create table if not exists public.chapter_resources (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,

  -- Provider is a column rather than an assumption so a future Vimeo or
  -- self-hosted swap does not need a migration on a populated table.
  provider text not null default 'youtube',
  kind text not null default 'video',
  external_id text not null,

  title text not null,
  channel_title text,
  channel_id text,
  duration_seconds int,
  view_count bigint,
  thumbnail_url text,

  -- Why a video can be unusable in Pakistan is not visible from the watch
  -- page, so the curation function records it at check time.
  embeddable boolean not null default true,
  region_blocked boolean not null default false,

  -- How the row got here: 'search' (auto-curated) or 'manual' (staff pasted a link).
  source text not null default 'search',
  search_query text,
  instructor_note text,

  display_order int not null default 0,
  status text not null default 'draft',
  last_checked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chapter_resources_provider_check check (provider in ('youtube')),
  constraint chapter_resources_kind_check check (kind in ('video', 'playlist')),
  constraint chapter_resources_source_check check (source in ('search', 'manual')),
  constraint chapter_resources_status_check check (status in ('draft', 'approved', 'rejected'))
);

-- The same video may legitimately sit on two chapters (e.g. a chain of
-- infection video on both Asepsis and Isolation), so uniqueness is per chapter.
create unique index if not exists chapter_resources_chapter_external_uniq
  on public.chapter_resources (chapter_id, provider, external_id);

create index if not exists idx_chapter_resources_chapter
  on public.chapter_resources (chapter_id, status, display_order);

grant select, insert, update on public.chapter_resources to authenticated;
grant all on public.chapter_resources to service_role;

alter table public.chapter_resources enable row level security;

drop policy if exists "read approved or staff" on public.chapter_resources;
create policy "read approved or staff" on public.chapter_resources
  for select to authenticated
  using (status = 'approved' or public.is_staff(auth.uid()));

drop policy if exists "staff insert resources" on public.chapter_resources;
create policy "staff insert resources" on public.chapter_resources
  for insert to authenticated
  with check (public.is_staff(auth.uid()));

drop policy if exists "staff update resources" on public.chapter_resources;
create policy "staff update resources" on public.chapter_resources
  for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop trigger if exists chapter_resources_touch_updated_at on public.chapter_resources;
create trigger chapter_resources_touch_updated_at
  before update on public.chapter_resources
  for each row execute function public.touch_updated_at();
