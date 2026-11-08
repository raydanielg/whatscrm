DROP POLICY IF EXISTS "messages update by sender or admin" ON public.messages;

CREATE POLICY "messages update by sender or admin"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    sent_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
  )
)
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
);