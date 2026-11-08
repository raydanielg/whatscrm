DROP POLICY IF EXISTS "Members read messenger accounts" ON public.messenger_accounts;

CREATE POLICY "messenger accounts select by admins" ON public.messenger_accounts
FOR SELECT TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

REVOKE ALL ON public.messenger_accounts FROM anon;