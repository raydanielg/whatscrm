-- Restrict WhatsApp catalog config access to workspace admins/owners only
DROP POLICY IF EXISTS "wa_catalog_config: members view" ON public.wa_catalog_config;
DROP POLICY IF EXISTS "wa_catalog_config: admins view" ON public.wa_catalog_config;
CREATE POLICY "wa_catalog_config: admins view"
  ON public.wa_catalog_config
  FOR SELECT
  TO authenticated
  USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

-- Standardize management policy
DROP POLICY IF EXISTS "wa_catalog_config: admins manage" ON public.wa_catalog_config;
CREATE POLICY "wa_catalog_config: admins manage"
  ON public.wa_catalog_config
  FOR ALL
  TO authenticated
  USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]))
  WITH CHECK (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

-- Also ensure catalog-related items are restricted
DROP POLICY IF EXISTS "wa_catalog_collections: admins manage" ON public.wa_catalog_collections;
CREATE POLICY "wa_catalog_collections: admins manage"
  ON public.wa_catalog_collections
  FOR ALL
  TO authenticated
  USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]))
  WITH CHECK (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

DROP POLICY IF EXISTS "wa_catalog_collections: members view" ON public.wa_catalog_collections;
CREATE POLICY "wa_catalog_collections: members view"
  ON public.wa_catalog_collections
  FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()));
