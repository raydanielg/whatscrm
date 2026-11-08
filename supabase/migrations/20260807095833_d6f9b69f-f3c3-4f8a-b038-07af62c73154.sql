CREATE POLICY "widget_uploads_select_workspace_member"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'widget-uploads' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()));

CREATE POLICY "widget_uploads_delete_workspace_member"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'widget-uploads' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()));