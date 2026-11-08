
-- Plugin logs, health, backups & categories
CREATE TABLE public.plugin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plugin_id uuid NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  installation_id uuid REFERENCES public.plugin_installations(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('debug','info','warn','error')),
  event text NOT NULL,
  message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plugin_logs_ws_created ON public.plugin_logs(workspace_id, created_at DESC);
CREATE INDEX idx_plugin_logs_plugin ON public.plugin_logs(plugin_id, created_at DESC);
CREATE INDEX idx_plugin_logs_level ON public.plugin_logs(level) WHERE level IN ('warn','error');
GRANT SELECT, INSERT ON public.plugin_logs TO authenticated;
GRANT ALL ON public.plugin_logs TO service_role;
ALTER TABLE public.plugin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plugin_logs ws members read"
  ON public.plugin_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = plugin_logs.workspace_id AND wm.user_id = auth.uid()));
CREATE POLICY "plugin_logs ws members insert"
  ON public.plugin_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = plugin_logs.workspace_id AND wm.user_id = auth.uid()));

CREATE TABLE public.plugin_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES public.plugin_installations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('healthy','degraded','failing','unknown')),
  latency_ms integer,
  error_rate numeric(5,2),
  cpu_usage numeric(5,2),
  memory_mb integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plugin_health_install ON public.plugin_health_checks(installation_id, checked_at DESC);
GRANT SELECT, INSERT ON public.plugin_health_checks TO authenticated;
GRANT ALL ON public.plugin_health_checks TO service_role;
ALTER TABLE public.plugin_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plugin_health ws members"
  ON public.plugin_health_checks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = plugin_health_checks.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = plugin_health_checks.workspace_id AND wm.user_id = auth.uid()));

CREATE TABLE public.plugin_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plugin_id uuid NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  installation_id uuid REFERENCES public.plugin_installations(id) ON DELETE SET NULL,
  version_id uuid REFERENCES public.plugin_versions(id) ON DELETE SET NULL,
  version_string text NOT NULL,
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  permissions_snapshot text[] NOT NULL DEFAULT '{}'::text[],
  storage_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plugin_backups_ws_plugin ON public.plugin_backups(workspace_id, plugin_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.plugin_backups TO authenticated;
GRANT ALL ON public.plugin_backups TO service_role;
ALTER TABLE public.plugin_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plugin_backups ws members"
  ON public.plugin_backups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = plugin_backups.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = plugin_backups.workspace_id AND wm.user_id = auth.uid()));

CREATE TABLE public.plugin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  icon text,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plugin_categories TO anon, authenticated;
GRANT ALL ON public.plugin_categories TO service_role;
ALTER TABLE public.plugin_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plugin_categories public read"
  ON public.plugin_categories FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.plugin_categories (slug, label, description, icon, sort_order) VALUES
  ('productivity', 'Productivity', 'Time-saving tools and workflows', 'zap', 10),
  ('ai', 'AI & Automation', 'AI assistants, automations, and copilots', 'sparkles', 20),
  ('analytics', 'Analytics & Reporting', 'Dashboards, metrics, and insights', 'bar-chart-3', 30),
  ('communication', 'Communication', 'Messaging, voice, and video channels', 'message-square', 40),
  ('crm', 'CRM & Sales', 'Contact enrichment, sales tooling, deal automation', 'users', 50),
  ('commerce', 'Commerce', 'Catalog, checkout, and order management', 'shopping-bag', 60),
  ('integration', 'Integrations', 'Connect Swiffer to third-party services', 'plug', 70),
  ('developer', 'Developer Tools', 'APIs, webhooks, and dev utilities', 'code-2', 80),
  ('other', 'Other', 'Everything else', 'package', 999);

-- Add plugin settings / storage columns to installations for rich management.
ALTER TABLE public.plugin_installations
  ADD COLUMN IF NOT EXISTS storage jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS previous_version_id uuid REFERENCES public.plugin_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_health_status text CHECK (last_health_status IN ('healthy','degraded','failing','unknown')),
  ADD COLUMN IF NOT EXISTS last_health_at timestamptz;
