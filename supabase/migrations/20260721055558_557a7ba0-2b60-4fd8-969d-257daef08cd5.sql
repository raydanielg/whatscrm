-- Tighten message update RLS: only the original sender (within their workspace)
-- or a workspace owner/admin can update a message. Drop the over-broad ALL policy
-- that let any workspace member update any message.

DROP POLICY IF EXISTS "messages by workspace member" ON public.messages;
DROP POLICY IF EXISTS "messages workspace update" ON public.messages;

CREATE POLICY "messages update by sender or admin"
  ON public.messages
  FOR UPDATE
  USING (
    is_workspace_member(workspace_id, auth.uid())
    AND (
      sent_by = auth.uid()
      OR has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
    )
  )
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
    AND (
      sent_by = auth.uid()
      OR has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
    )
  );
