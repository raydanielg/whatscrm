-- Align storage RLS with actual upload path: `${workspace_id}/${conversation_id}/...`
DROP POLICY IF EXISTS attachments_insert_own ON storage.objects;
DROP POLICY IF EXISTS attachments_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS attachments_delete_own ON storage.objects;

CREATE POLICY attachments_insert_workspace_member
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND public.is_workspace_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

CREATE POLICY attachments_select_workspace_member
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.is_workspace_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

CREATE POLICY attachments_update_workspace_member
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.is_workspace_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND public.is_workspace_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

CREATE POLICY attachments_delete_workspace_member
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      owner = auth.uid()
      OR public.is_workspace_member(
        ((storage.foldername(name))[1])::uuid,
        auth.uid()
      )
    )
  );
