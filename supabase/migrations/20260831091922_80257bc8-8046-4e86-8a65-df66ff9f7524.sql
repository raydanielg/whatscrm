CREATE POLICY "social_media_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'social-media' AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE POLICY "social_media_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'social-media' AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE POLICY "social_media_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'social-media' AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid));