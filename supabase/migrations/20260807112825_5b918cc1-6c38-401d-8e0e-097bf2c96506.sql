DROP POLICY IF EXISTS "Members read social channels" ON public.social_channels;
CREATE POLICY "Workspace admins read social channels" ON public.social_channels FOR SELECT TO authenticated USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));
REVOKE ALL ON public.social_channels FROM anon;