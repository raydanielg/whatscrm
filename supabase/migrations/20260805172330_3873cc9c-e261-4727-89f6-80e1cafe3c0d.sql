-- Restrict credential-bearing channel/calendar account rows to owners & admins.

DROP POLICY IF EXISTS "Workspace members view calendar accounts" ON public.calendar_accounts;
CREATE POLICY "Calendar accounts readable by owner or workspace admins"
ON public.calendar_accounts FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);

DROP POLICY IF EXISTS "channel_accounts: workspace members read" ON public.channel_accounts;
CREATE POLICY "channel_accounts: admins read"
ON public.channel_accounts FOR SELECT TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

DROP POLICY IF EXISTS "ig accounts select by members" ON public.instagram_accounts;
CREATE POLICY "ig accounts select by admins"
ON public.instagram_accounts FOR SELECT TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));