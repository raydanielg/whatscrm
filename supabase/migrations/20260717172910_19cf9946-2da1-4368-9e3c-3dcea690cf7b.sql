
DROP POLICY IF EXISTS "Members read own exports files" ON storage.objects;
CREATE POLICY "Members read own exports files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'exports'
    AND EXISTS (
      SELECT 1 FROM public.export_jobs j
      WHERE j.file_path = storage.objects.name
        AND public.is_workspace_member(j.workspace_id, auth.uid())
        AND (j.created_by = auth.uid()
             OR j.visibility = 'workspace'
             OR public.has_workspace_role(j.workspace_id, auth.uid(), ARRAY['owner','admin','manager']::workspace_role[]))
    )
  );
