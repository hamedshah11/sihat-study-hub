
CREATE TABLE public.diagram_labels (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  title text not null,
  image_path text not null,
  pins jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagram_labels TO authenticated;
GRANT ALL ON public.diagram_labels TO service_role;

ALTER TABLE public.diagram_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read approved or admin" ON public.diagram_labels
  FOR SELECT TO authenticated
  USING (status = 'approved' OR public.is_admin(auth.uid()));

CREATE POLICY "admin manage diagrams" ON public.diagram_labels
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER diagram_labels_touch_updated_at
  BEFORE UPDATE ON public.diagram_labels
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_diagram_labels_chapter ON public.diagram_labels(chapter_id, display_order);
