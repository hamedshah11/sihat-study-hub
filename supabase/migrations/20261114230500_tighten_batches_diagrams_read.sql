-- Batches: students read only their own batch; staff read all.
drop policy if exists "Anyone authed can read batches" on public.batches;
create policy "Read own batch or staff"
  on public.batches for select to authenticated
  using (
    public.is_staff(auth.uid())
    or id = (select p.batch_id from public.profiles p where p.id = auth.uid())
  );

-- Diagrams: staff read all files; students only files of approved diagrams in published chapters.
drop policy if exists "diagrams read auth" on storage.objects;
create policy "diagrams read published or staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'diagrams'
    and (
      public.is_staff(auth.uid())
      or exists (
        select 1
          from public.diagram_labels d
          join public.chapters c on c.id = d.chapter_id
         where d.status = 'approved'
           and c.status = 'published'
           and (d.image_path = storage.objects.name or d.base_image_path = storage.objects.name)
      )
    )
  );
