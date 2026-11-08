
-- 1) Platform-level role enum & table (superadmin / support)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('superadmin','support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin');
$$;

DROP POLICY IF EXISTS "Users view own platform roles" ON public.user_roles;
CREATE POLICY "Users view own platform roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage platform roles" ON public.user_roles;
CREATE POLICY "Super admins manage platform roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 2) Expand permission catalog
INSERT INTO public.permissions (key, resource, action, description) VALUES
  -- CRUD - Contacts
  ('contacts.create','contacts','create','Create contacts'),
  ('contacts.read','contacts','read','View contacts'),
  ('contacts.update','contacts','update','Update contacts'),
  ('contacts.delete','contacts','delete','Delete contacts'),
  -- Companies
  ('companies.create','companies','create','Create companies'),
  ('companies.read','companies','read','View companies'),
  ('companies.update','companies','update','Update companies'),
  ('companies.delete','companies','delete','Delete companies'),
  -- Deals
  ('deals.create','deals','create','Create deals'),
  ('deals.read','deals','read','View deals'),
  ('deals.update','deals','update','Update deals'),
  ('deals.delete','deals','delete','Delete deals'),
  -- Campaigns
  ('campaigns.create','campaigns','create','Create campaigns'),
  ('campaigns.read','campaigns','read','View campaigns'),
  ('campaigns.update','campaigns','update','Update campaigns'),
  ('campaigns.delete','campaigns','delete','Delete campaigns'),
  ('campaigns.send','campaigns','send','Send campaigns'),
  -- Automations
  ('automations.create','automations','create','Create automations'),
  ('automations.read','automations','read','View automations'),
  ('automations.update','automations','update','Update automations'),
  ('automations.delete','automations','delete','Delete automations'),
  -- Inbox / conversations
  ('inbox.read','inbox','read','View inbox'),
  ('inbox.reply','inbox','reply','Reply to conversations'),
  ('inbox.assign','inbox','assign','Assign conversations'),
  -- Reports / analytics
  ('analytics.read','analytics','read','View analytics'),
  ('reports.read','reports','read','View reports'),
  ('reports.export','reports','export','Export reports'),
  -- AI studio
  ('ai.use','ai','use','Use AI Studio'),
  -- Workspace
  ('workspace.read','workspaces','read','View workspace'),
  ('workspace.update','workspaces','update','Update workspace'),
  ('workspace.delete','workspaces','delete','Delete workspace'),
  ('workspace.invite','workspaces','invite','Invite members'),
  ('workspace.manage_members','workspaces','manage_members','Manage members'),
  -- Billing
  ('billing.read','billing','read','View billing'),
  ('billing.manage','billing','manage','Manage subscription'),
  ('billing.invoices','billing','invoices','Access invoices'),
  -- Organization
  ('organization.read','organizations','read','View organization'),
  ('organization.update','organizations','update','Update organization'),
  ('organization.delete','organizations','delete','Delete organization'),
  ('organization.transfer','organizations','transfer','Transfer ownership'),
  -- Roles & permissions
  ('roles.read','roles','read','View roles'),
  ('roles.manage','roles','manage','Create and edit roles'),
  ('roles.assign','roles','assign','Assign roles to users'),
  -- API
  ('api_keys.read','api_keys','read','View API keys'),
  ('api_keys.manage','api_keys','manage','Create and revoke API keys'),
  -- Pages / menu
  ('page.dashboard','pages','view','View dashboard page'),
  ('page.inbox','pages','view','View inbox page'),
  ('page.contacts','pages','view','View contacts page'),
  ('page.companies','pages','view','View companies page'),
  ('page.deals','pages','view','View deals page'),
  ('page.campaigns','pages','view','View campaigns page'),
  ('page.automations','pages','view','View automations page'),
  ('page.ai_studio','pages','view','View AI studio page'),
  ('page.analytics','pages','view','View analytics page'),
  ('page.reports','pages','view','View reports page'),
  ('page.team','pages','view','View team page'),
  ('page.billing','pages','view','View billing page'),
  ('page.settings','pages','view','View settings page'),
  ('page.organization','pages','view','View organization page'),
  ('page.workspace','pages','view','View workspace page'),
  ('page.roles','pages','view','View roles page'),
  -- Audit
  ('audit_logs.read','audit_logs','read','View audit logs')
ON CONFLICT (key) DO NOTHING;

-- 3) Seed default SYSTEM roles (organization_id NULL, is_system = true)
INSERT INTO public.roles (organization_id, scope, key, name, description, is_system) VALUES
  (NULL,'organization','owner','Owner','Full access to the organization',true),
  (NULL,'organization','admin','Admin','Administrative access',true),
  (NULL,'organization','manager','Manager','Manage teams and pipelines',true),
  (NULL,'organization','sales_agent','Sales Agent','Sales pipeline access',true),
  (NULL,'organization','support_agent','Support Agent','Handle customer conversations',true),
  (NULL,'organization','marketing','Marketing','Campaigns and automations',true),
  (NULL,'organization','viewer','Viewer','Read-only access',true)
ON CONFLICT (organization_id, key) DO NOTHING;

-- Helper to map permissions to a system role
CREATE OR REPLACE FUNCTION public._grant_perms(_role_key text, _perm_keys text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _rid uuid;
BEGIN
  SELECT id INTO _rid FROM public.roles WHERE organization_id IS NULL AND key = _role_key;
  IF _rid IS NULL THEN RETURN; END IF;
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT _rid, p.id FROM public.permissions p WHERE p.key = ANY(_perm_keys)
  ON CONFLICT DO NOTHING;
END; $$;

-- Owner & Admin: all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.organization_id IS NULL AND r.key IN ('owner','admin')
ON CONFLICT DO NOTHING;

-- Manager
SELECT public._grant_perms('manager', ARRAY[
  'page.dashboard','page.inbox','page.contacts','page.companies','page.deals',
  'page.campaigns','page.automations','page.analytics','page.reports','page.team',
  'page.settings','page.workspace','page.roles','page.ai_studio',
  'contacts.create','contacts.read','contacts.update','contacts.delete',
  'companies.create','companies.read','companies.update','companies.delete',
  'deals.create','deals.read','deals.update','deals.delete',
  'campaigns.create','campaigns.read','campaigns.update','campaigns.send',
  'automations.create','automations.read','automations.update',
  'inbox.read','inbox.reply','inbox.assign',
  'analytics.read','reports.read','reports.export','ai.use',
  'workspace.read','workspace.update','workspace.invite','workspace.manage_members',
  'organization.read','roles.read','roles.assign','audit_logs.read'
]);

-- Sales Agent
SELECT public._grant_perms('sales_agent', ARRAY[
  'page.dashboard','page.inbox','page.contacts','page.companies','page.deals',
  'page.analytics','page.reports','page.settings',
  'contacts.create','contacts.read','contacts.update',
  'companies.create','companies.read','companies.update',
  'deals.create','deals.read','deals.update',
  'inbox.read','inbox.reply',
  'analytics.read','reports.read',
  'workspace.read','organization.read'
]);

-- Support Agent
SELECT public._grant_perms('support_agent', ARRAY[
  'page.dashboard','page.inbox','page.contacts','page.companies','page.settings',
  'contacts.read','contacts.update',
  'companies.read',
  'inbox.read','inbox.reply','inbox.assign',
  'workspace.read','organization.read'
]);

-- Marketing
SELECT public._grant_perms('marketing', ARRAY[
  'page.dashboard','page.campaigns','page.automations','page.ai_studio',
  'page.analytics','page.reports','page.contacts','page.settings',
  'contacts.read',
  'campaigns.create','campaigns.read','campaigns.update','campaigns.delete','campaigns.send',
  'automations.create','automations.read','automations.update','automations.delete',
  'ai.use','analytics.read','reports.read','reports.export',
  'workspace.read','organization.read'
]);

-- Viewer
SELECT public._grant_perms('viewer', ARRAY[
  'page.dashboard','page.inbox','page.contacts','page.companies','page.deals',
  'page.campaigns','page.automations','page.analytics','page.reports','page.settings',
  'contacts.read','companies.read','deals.read','campaigns.read','automations.read',
  'inbox.read','analytics.read','reports.read',
  'workspace.read','organization.read'
]);

DROP FUNCTION public._grant_perms(text, text[]);

-- 4) Core has_permission function with super admin override
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid,
  _permission_key text,
  _organization_id uuid DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.role_permissions rp ON rp.role_id = ura.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      LEFT JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = _user_id
        AND p.key = _permission_key
        AND (_organization_id IS NULL OR ura.organization_id = _organization_id OR ura.organization_id IS NULL)
        AND (_workspace_id IS NULL OR ura.workspace_id = _workspace_id OR ura.workspace_id IS NULL)
    )
    -- Fallback: legacy org_role → owner/admin implicit full permissions
    OR (
      _organization_id IS NOT NULL
      AND public.has_org_role(_organization_id, _user_id, ARRAY['owner'::org_role,'admin'::org_role])
    );
$$;

-- Effective permission keys resolver (used by frontend hook)
CREATE OR REPLACE FUNCTION public.my_permissions(
  _organization_id uuid DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL
) RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Super admin: everything
  SELECT p.key FROM public.permissions p
  WHERE public.is_super_admin(auth.uid())
  UNION
  -- Org owner/admin (legacy fallback): everything
  SELECT p.key FROM public.permissions p
  WHERE _organization_id IS NOT NULL
    AND public.has_org_role(_organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role])
  UNION
  -- Assigned roles
  SELECT DISTINCT p.key
  FROM public.user_role_assignments ura
  JOIN public.role_permissions rp ON rp.role_id = ura.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ura.user_id = auth.uid()
    AND (_organization_id IS NULL OR ura.organization_id = _organization_id OR ura.organization_id IS NULL)
    AND (_workspace_id  IS NULL OR ura.workspace_id  = _workspace_id  OR ura.workspace_id  IS NULL);
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions(uuid,uuid) TO authenticated;
