DROP POLICY IF EXISTS "meeting accounts: workspace members" ON public.meeting_provider_accounts;
CREATE POLICY "meeting accounts: admins manage"
ON public.meeting_provider_accounts
FOR ALL
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

DROP POLICY IF EXISTS "ws manage wa_catalog_config" ON public.wa_catalog_config;
CREATE POLICY "wa_catalog_config: admins manage"
ON public.wa_catalog_config
FOR ALL
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));