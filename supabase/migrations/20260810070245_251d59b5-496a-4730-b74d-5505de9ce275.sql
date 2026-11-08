-- 1) billing_document_templates: read for members, write for owner/admin/billing
DROP POLICY IF EXISTS "org members manage templates" ON public.billing_document_templates;

CREATE POLICY "bdt select org members" ON public.billing_document_templates
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE POLICY "bdt insert billing roles" ON public.billing_document_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'billing'::org_role]));

CREATE POLICY "bdt update billing roles" ON public.billing_document_templates
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'billing'::org_role]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'billing'::org_role]));

CREATE POLICY "bdt delete billing roles" ON public.billing_document_templates
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'billing'::org_role]));

-- 2) workspace_invitations: invite tokens only for workspace admins or the invitee
DROP POLICY IF EXISTS "wsinv select members or invitee" ON public.workspace_invitations;

CREATE POLICY "wsinv select admins or invitee" ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );