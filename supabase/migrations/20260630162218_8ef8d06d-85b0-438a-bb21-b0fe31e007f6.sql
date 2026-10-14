
CREATE POLICY "Anyone can upload punch photos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'time-punch-photos');

CREATE POLICY "Authenticated can read punch photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'time-punch-photos');

CREATE POLICY "Anon can read own uploaded punch photos" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'time-punch-photos');

CREATE POLICY "Authenticated can delete punch photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'time-punch-photos');
