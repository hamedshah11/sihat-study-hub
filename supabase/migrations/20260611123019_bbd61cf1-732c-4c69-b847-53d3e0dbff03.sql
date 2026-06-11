
CREATE POLICY "diagrams read auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'diagrams');

CREATE POLICY "diagrams admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'diagrams' AND public.is_admin(auth.uid()));

CREATE POLICY "diagrams admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'diagrams' AND public.is_admin(auth.uid()));

CREATE POLICY "diagrams admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'diagrams' AND public.is_admin(auth.uid()));
