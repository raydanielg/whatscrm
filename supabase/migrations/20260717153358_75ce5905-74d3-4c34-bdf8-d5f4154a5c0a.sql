
CREATE POLICY "campaign-media read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'campaign-media');
CREATE POLICY "campaign-media insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'campaign-media');
CREATE POLICY "campaign-media update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'campaign-media');
CREATE POLICY "campaign-media delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'campaign-media');
