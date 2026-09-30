-- Subject colour families used by the student app. Safe to re-run manually.
alter table public.subjects
  add column if not exists colour text not null default 'cobalt';

update public.subjects
set colour = case
  when name ilike any (array['Fundamentals of Nursing I', 'Fundamentals of Nursing II', 'Medical Surgical Nursing I', 'Medical Surgical Nursing II', 'Critical Care Nursing', 'Clinical Practicum']) then 'cobalt'
  when name ilike any (array['Anatomy and Physiology I', 'Anatomy and Physiology II', 'Pathophysiology I', 'Pathophysiology II', 'Health Assessment I', 'Health Assessment II']) then 'violet'
  when name ilike any (array['Pediatric Health Nursing', 'Maternal Neonatal and Child Health Nursing', 'Mental Health Nursing', 'Geriatric Nursing']) then 'pink'
  when name ilike any (array['Microbiology', 'Infectious Diseases', 'Public Health Nursing']) then 'mint'
  when name ilike any (array['Biochemistry', 'Applied Nutrition', 'Clinical Pharmacology and Drug Administration I', 'Clinical Pharmacology and Drug Administration II']) then 'sky'
  when name ilike any (array['English (Functional English)', 'Professional Communication Skills', 'Expository Writing', 'Principles of Teaching and Learning']) then 'indigo'
  when name ilike any (array['Information and Communication Technology', 'Quantitative Reasoning I', 'Introduction to Biostatistics', 'Epidemiology', 'Introduction to Nursing Research']) then 'aqua'
  when name ilike any (array['Ideology and Constitution of Pakistan', 'Islamic Studies / Ethics', 'Theoretical Basis of Nursing', 'Applied Psychology', 'Professional Ethics for Nurses', 'Civics and Community Engagement', 'Culture Health and Society', 'Leadership and Management', 'Entrepreneurship', 'Trends and Issues in Health Care', 'Electives']) then 'slate'
  else colour
end;

update public.subjects set colour = 'cobalt' where colour is null;

alter table public.subjects alter column colour set default 'cobalt';
alter table public.subjects alter column colour set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subjects'::regclass
      and conname = 'subjects_colour_check'
  ) then
    alter table public.subjects add constraint subjects_colour_check
      check (colour in ('cobalt', 'violet', 'pink', 'mint', 'sky', 'indigo', 'aqua', 'slate'));
  end if;
end
$$;
