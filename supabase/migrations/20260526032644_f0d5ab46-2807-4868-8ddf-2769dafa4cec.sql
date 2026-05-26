
-- Status enum for chapters
create type public.chapter_status as enum ('draft', 'published');

-- Semesters
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  number int not null unique check (number between 1 and 12),
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Subjects
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  name text not null,
  description text,
  icon text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_subjects_semester on public.subjects(semester_id);

-- Chapters
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  display_order int not null default 0,
  status public.chapter_status not null default 'draft',
  summary_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_chapters_subject on public.chapters(subject_id);

-- updated_at triggers (reuse existing touch_updated_at)
create trigger trg_semesters_updated before update on public.semesters
  for each row execute function public.touch_updated_at();
create trigger trg_subjects_updated before update on public.subjects
  for each row execute function public.touch_updated_at();
create trigger trg_chapters_updated before update on public.chapters
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.semesters enable row level security;
alter table public.subjects enable row level security;
alter table public.chapters enable row level security;

-- Read access for authenticated users
create policy "Authenticated read semesters" on public.semesters
  for select to authenticated using (true);
create policy "Authenticated read subjects" on public.subjects
  for select to authenticated using (true);
create policy "Authenticated read published chapters" on public.chapters
  for select to authenticated using (status = 'published' or public.has_role(auth.uid(), 'admin'));

-- Admin manage
create policy "Admins manage semesters" on public.semesters
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage subjects" on public.subjects
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage chapters" on public.chapters
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Seed semesters 1-8
insert into public.semesters (number, name)
select g, 'Semester ' || g from generate_series(1, 8) g;

-- Seed Semester 1 subject + chapter
do $$
declare
  sem1_id uuid;
  subject_id uuid;
begin
  select id into sem1_id from public.semesters where number = 1 limit 1;

  insert into public.subjects (semester_id, name, description, icon, display_order)
  values (
    sem1_id,
    'Anatomy and Physiology I',
    'The structure and function of the human body, from cells to organ systems.',
    'heart-pulse',
    1
  ) returning id into subject_id;

  insert into public.chapters (subject_id, title, display_order, status, summary_md)
  values (
    subject_id,
    'Introduction to Cells',
    1,
    'published',
    E'# Introduction to Cells\n\nCells are the basic units of life. Every living thing, from the smallest bacterium to the largest whale, is made of cells.\n\n## What is a cell?\n\nA cell is a tiny, self-contained unit that can carry out all the processes of life: taking in nutrients, producing energy, growing, and reproducing.\n\n## Types of cells\n\nThere are two main categories:\n\n- **Prokaryotic cells** — simple cells without a nucleus. Bacteria are prokaryotes.\n- **Eukaryotic cells** — complex cells with a nucleus and organelles. All plant, animal, and human cells are eukaryotes.\n\n## Key parts of a human cell\n\n- **Cell membrane**: the outer boundary that controls what enters and leaves.\n- **Cytoplasm**: the gel-like fluid filling the cell.\n- **Nucleus**: contains the DNA, the genetic blueprint.\n- **Mitochondria**: produce energy in the form of ATP.\n- **Ribosomes**: build proteins.\n\n## Why this matters for nursing\n\nUnderstanding cells is the foundation for understanding everything else in nursing. When a patient has cancer, the disease starts at the cellular level. When a drug works, it works by interacting with cell components. Every clinical decision you make as a nurse is, ultimately, about cells.'
  );
end $$;
