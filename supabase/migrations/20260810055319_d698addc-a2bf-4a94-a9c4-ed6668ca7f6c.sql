DROP POLICY IF EXISTS "org members read documents" ON public.billing_documents;
DROP POLICY IF EXISTS "org members insert documents" ON public.billing_documents;

CREATE POLICY "Billing roles read documents"
ON public.billing_documents FOR SELECT TO authenticated
USING (has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]));

CREATE POLICY "Billing roles insert documents"
ON public.billing_documents FOR INSERT TO authenticated
WITH CHECK (has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]));

DROP POLICY IF EXISTS "Read settings in scope" ON public.settings;

CREATE POLICY "Read settings in scope"
ON public.settings FOR SELECT TO authenticated
USING (
  ((scope = 'user'::settings_scope) AND (user_id = auth.uid()))
  OR ((scope = 'organization'::settings_scope) AND (organization_id IS NOT NULL) AND is_org_member(organization_id, auth.uid()))
  OR ((scope = 'workspace'::settings_scope) AND (workspace_id IS NOT NULL) AND is_workspace_member(workspace_id, auth.uid()))
  OR ((scope = 'platform'::settings_scope) AND is_super_admin(auth.uid()))
);