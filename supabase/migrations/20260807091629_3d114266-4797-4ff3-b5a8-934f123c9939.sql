DROP POLICY IF EXISTS "messages workspace read" ON public.messages;
CREATE POLICY "messages workspace read"
ON public.messages FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));