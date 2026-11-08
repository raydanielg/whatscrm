-- api_keys: remove member-wide read
DROP POLICY IF EXISTS "Members view org api keys" ON public.api_keys;

-- oauth_clients: restrict to owner/admin
DROP POLICY IF EXISTS "org members read own clients" ON public.oauth_clients;
DROP POLICY IF EXISTS "org members manage own clients" ON public.oauth_clients;
CREATE POLICY "Admins manage oauth clients" ON public.oauth_clients
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]));

-- webhook_endpoints: restrict to owner/admin
DROP POLICY IF EXISTS "org members manage own webhooks" ON public.webhook_endpoints;
CREATE POLICY "Admins manage webhook endpoints" ON public.webhook_endpoints
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role]));