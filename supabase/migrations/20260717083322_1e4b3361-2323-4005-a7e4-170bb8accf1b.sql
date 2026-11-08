
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'member', 'billing', 'guest');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused');
CREATE TYPE public.plan_interval AS ENUM ('month', 'year', 'lifetime');
CREATE TYPE public.audit_action AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'invite', 'revoke', 'export', 'access');
CREATE TYPE public.notification_channel AS ENUM ('in_app', 'email', 'push', 'sms');
CREATE TYPE public.notification_status AS ENUM ('unread', 'read', 'archived');
CREATE TYPE public.settings_scope AS ENUM ('platform', 'organization', 'workspace', 'user');
CREATE TYPE public.role_scope AS ENUM ('platform', 'organization', 'workspace');

-- =========================================================
-- SHARED updated_at trigger already exists: public.tg_set_updated_at()
-- =========================================================

-- =========================================================
-- ORGANIZATIONS
-- =========================================================
CREATE TABLE public.organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  logo_url     text,
  billing_email text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizations_owner_id ON public.organizations(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.organization_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            public.org_role NOT NULL DEFAULT 'member',
  invited_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org  ON public.organization_members(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_org_members_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Security-definer helpers to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _user_id uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org_id AND user_id = _user_id AND role = ANY(_roles));
$$;

-- Organizations policies
CREATE POLICY "Members can view their organizations" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id, auth.uid()) OR owner_id = auth.uid());
CREATE POLICY "Users can create organizations" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Admins can update their organization" ON public.organizations
  FOR UPDATE TO authenticated USING (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Owners can delete their organization" ON public.organizations
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Organization members policies
CREATE POLICY "Members can view organization membership" ON public.organization_members
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Admins can add members" ON public.organization_members
  FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Admins can update members" ON public.organization_members
  FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Admins can remove members" ON public.organization_members
  FOR DELETE TO authenticated USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- Link existing workspaces to organizations (nullable for backward compat)
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_workspaces_organization_id ON public.workspaces(organization_id);

-- =========================================================
-- RBAC: ROLES & PERMISSIONS
-- =========================================================
CREATE TABLE public.permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,          -- e.g. 'contacts.read'
  resource    text NOT NULL,                 -- e.g. 'contacts'
  action      text NOT NULL,                 -- e.g. 'read'
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read permission catalog" ON public.permissions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE, -- null = system role
  scope           public.role_scope NOT NULL DEFAULT 'organization',
  key             text NOT NULL,
  name            text NOT NULL,
  description     text,
  is_system       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "Read system and own org roles" ON public.roles
  FOR SELECT TO authenticated USING (organization_id IS NULL OR public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Admins manage org roles" ON public.roles
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE TABLE public.role_permissions (
  role_id       uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read role_permissions for accessible roles" ON public.role_permissions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND (r.organization_id IS NULL OR public.is_org_member(r.organization_id, auth.uid())))
  );
CREATE POLICY "Admins manage role_permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.organization_id IS NOT NULL AND public.has_org_role(r.organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.organization_id IS NOT NULL AND public.has_org_role(r.organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])));

CREATE TABLE public.user_role_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id         uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  granted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, organization_id, workspace_id)
);
CREATE INDEX idx_ura_user ON public.user_role_assignments(user_id);
CREATE INDEX idx_ura_org  ON public.user_role_assignments(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_role_assignments TO authenticated;
GRANT ALL ON public.user_role_assignments TO service_role;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own or org role assignments" ON public.user_role_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid())));
CREATE POLICY "Admins manage org role assignments" ON public.user_role_assignments
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- =========================================================
-- PLANS & SUBSCRIPTIONS
-- =========================================================
CREATE TABLE public.plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,          -- 'free' | 'pro' | 'business' | 'enterprise'
  name          text NOT NULL,
  description   text,
  price_cents   integer NOT NULL DEFAULT 0,
  currency      text NOT NULL DEFAULT 'USD',
  interval      public.plan_interval NOT NULL DEFAULT 'month',
  features      jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "Anyone can read active plans" ON public.plans FOR SELECT USING (is_active = true);

CREATE TABLE public.subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id               uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status                public.subscription_status NOT NULL DEFAULT 'trialing',
  provider              text,                    -- 'stripe' | 'paddle' | 'manual'
  provider_customer_id  text,
  provider_subscription_id text,
  seats                 integer NOT NULL DEFAULT 1,
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at             timestamptz,
  canceled_at           timestamptz,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)                       -- one active subscription per org
);
CREATE INDEX idx_subscriptions_org ON public.subscriptions(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "Members view org subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Billing/admin manage subscription" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','billing']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','billing']::public.org_role[]));

-- =========================================================
-- AUDIT LOGS  (append-only)
-- =========================================================
CREATE TABLE public.audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action          public.audit_action NOT NULL,
  resource_type   text NOT NULL,
  resource_id     text,
  ip_address      inet,
  user_agent      text,
  changes         jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_actor       ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_resource    ON public.audit_logs(resource_type, resource_id);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view org audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));
-- No INSERT/UPDATE/DELETE policies → only service_role writes (append-only).

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
CREATE TABLE public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel         public.notification_channel NOT NULL DEFAULT 'in_app',
  status          public.notification_status NOT NULL DEFAULT 'unread',
  title           text NOT NULL,
  body            text,
  action_url      text,
  category        text,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_status  ON public.notifications(user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- Inserts done by service_role.

-- =========================================================
-- FILES
-- =========================================================
CREATE TABLE public.files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  uploader_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket          text NOT NULL,
  path            text NOT NULL,
  name            text NOT NULL,
  mime_type       text,
  size_bytes      bigint NOT NULL DEFAULT 0,
  checksum        text,
  is_public       boolean NOT NULL DEFAULT false,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);
CREATE INDEX idx_files_org ON public.files(organization_id);
CREATE INDEX idx_files_workspace ON public.files(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT ALL ON public.files TO service_role;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "Read files in own org or public" ON public.files
  FOR SELECT TO authenticated USING (is_public OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid())));
CREATE POLICY "Members upload files to their org" ON public.files
  FOR INSERT TO authenticated WITH CHECK (uploader_id = auth.uid() AND (organization_id IS NULL OR public.is_org_member(organization_id, auth.uid())));
CREATE POLICY "Uploader or admins update files" ON public.files
  FOR UPDATE TO authenticated USING (uploader_id = auth.uid() OR (organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])));
CREATE POLICY "Uploader or admins delete files" ON public.files
  FOR DELETE TO authenticated USING (uploader_id = auth.uid() OR (organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])));

-- =========================================================
-- SESSIONS  (application-level session tracking)
-- =========================================================
CREATE TABLE public.sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device          text,
  user_agent      text,
  ip_address      inet,
  location        text,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON public.sessions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sessions" ON public.sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users revoke own sessions" ON public.sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own sessions" ON public.sessions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- =========================================================
-- API KEYS
-- =========================================================
CREATE TABLE public.api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text NOT NULL,
  prefix          text NOT NULL,       -- shown to user, e.g. 'lv_live_abcd'
  hashed_key      text NOT NULL UNIQUE,-- store only the hash
  scopes          text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_org ON public.api_keys(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view org api keys" ON public.api_keys
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Admins manage api keys" ON public.api_keys
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- =========================================================
-- SETTINGS  (polymorphic key/value)
-- =========================================================
CREATE TABLE public.settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           public.settings_scope NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  key             text NOT NULL,
  value           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, organization_id, workspace_id, user_id, key)
);
CREATE INDEX idx_settings_org  ON public.settings(organization_id);
CREATE INDEX idx_settings_user ON public.settings(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "Read settings in scope" ON public.settings
  FOR SELECT TO authenticated USING (
    (scope = 'user'         AND user_id = auth.uid())
 OR (scope = 'organization' AND organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
 OR (scope = 'workspace'    AND workspace_id    IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
 OR (scope = 'platform')
  );
CREATE POLICY "Write own user settings" ON public.settings
  FOR ALL TO authenticated
  USING (scope = 'user' AND user_id = auth.uid())
  WITH CHECK (scope = 'user' AND user_id = auth.uid());
CREATE POLICY "Admins manage org settings" ON public.settings
  FOR ALL TO authenticated
  USING (scope = 'organization' AND organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (scope = 'organization' AND organization_id IS NOT NULL AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- =========================================================
-- ACTIVITIES  (user-visible activity feed)
-- =========================================================
CREATE TABLE public.activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verb            text NOT NULL,          -- 'created', 'commented', 'closed', ...
  object_type     text NOT NULL,
  object_id       text,
  target_type     text,
  target_id       text,
  summary         text,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_org_created ON public.activities(organization_id, created_at DESC);
CREATE INDEX idx_activities_actor       ON public.activities(actor_id);
GRANT SELECT, INSERT ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read org activities" ON public.activities
  FOR SELECT TO authenticated USING (organization_id IS NULL OR public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Members insert activities as self" ON public.activities
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND (organization_id IS NULL OR public.is_org_member(organization_id, auth.uid())));

-- =========================================================
-- SEED: system plans and base permissions
-- =========================================================
INSERT INTO public.plans (code, name, description, price_cents, interval, sort_order, features, limits) VALUES
  ('free',       'Free',       'For individuals getting started',           0,   'month', 0, '{"support":"community"}',  '{"seats":3,"workspaces":1}'),
  ('pro',        'Pro',        'For growing teams',                      2900,   'month', 1, '{"support":"email"}',      '{"seats":10,"workspaces":5}'),
  ('business',   'Business',   'Advanced controls and SSO',              9900,   'month', 2, '{"support":"priority","sso":true}', '{"seats":50,"workspaces":25}'),
  ('enterprise', 'Enterprise', 'Custom limits, SLA, and dedicated CSM', 49900,   'month', 3, '{"support":"dedicated","sso":true,"audit_export":true}', '{"seats":null,"workspaces":null}')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (key, resource, action, description) VALUES
  ('organizations.read',   'organizations','read',   'View organization'),
  ('organizations.update', 'organizations','update', 'Update organization settings'),
  ('members.invite',       'members',      'invite', 'Invite organization members'),
  ('members.remove',       'members',      'remove', 'Remove organization members'),
  ('billing.read',         'billing',      'read',   'View billing information'),
  ('billing.manage',       'billing',      'manage', 'Manage subscription and billing'),
  ('workspaces.create',    'workspaces',   'create', 'Create workspaces'),
  ('workspaces.delete',    'workspaces',   'delete', 'Delete workspaces'),
  ('api_keys.manage',      'api_keys',     'manage', 'Manage API keys'),
  ('audit_logs.read',      'audit_logs',   'read',   'View audit logs')
ON CONFLICT (key) DO NOTHING;
