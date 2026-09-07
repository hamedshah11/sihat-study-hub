-- Learning objectives for chapters.
--
-- Stored as an ordered JSON array of strings, e.g.
--   ["Describe the structure of the cell membrane", "List the four tissue types"]
-- Order is meaningful and is preserved exactly as the editor saves it, so this
-- is an array rather than a set or a child table.
--
-- Nullable with no default: NULL means "no objectives recorded", which is the
-- state every existing chapter starts in and must keep rendering normally.
-- Readers treat NULL and [] identically (nothing shown), so nothing existing
-- is gated on this column.

alter table public.chapters
  add column if not exists learning_objectives jsonb default null;

comment on column public.chapters.learning_objectives is
  'Ordered array of learning-objective strings, or NULL when none are recorded.';
