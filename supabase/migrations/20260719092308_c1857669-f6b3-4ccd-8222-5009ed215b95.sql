
-- =============================================================
-- Phase 24 — Plugin Marketplace, Themes & White Label
-- =============================================================

-- Plugins catalog
CREATE TABLE IF NOT EXISTS public.plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  description text,
  category text NOT NULL DEFAULT 'other',
  tags text[] NOT NULL DEFAULT '{}',
  icon_url text,
  banner_url text,
  homepage_url text,
  repo_url text,
  publisher_id uuid NOT NULL,
  publisher_name text,
  pricing_model text NOT NULL DEFAULT 'free' CHECK (pricing_model IN ('free','one_time','subscription','freemium')),
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  is_public boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  install_count integer NOT NULL DEFAULT 0,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','rejected','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plugins_public ON public.plugins(is_public, status) WHERE is_public AND status = 'published';
CREATE INDEX IF NOT EXISTS idx_plugins_publisher ON public.plugins(publisher_id);
CREATE INDEX IF NOT EXISTS idx_plugins_category ON public.plugins(category);

GRANT SELECT ON public.plugins TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plugins TO authenticated;
GRANT ALL ON public.plugins TO service_role;
ALTER TABLE public.plugins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plugins public read" ON public.plugins FOR SELECT
  USING (is_public AND status = 'published');
CREATE POLICY "plugins publisher read" ON public.plugins FOR SELECT TO authenticated
  USING (publisher_id = auth.uid());
CREATE POLICY "plugins publisher write" ON public.plugins FOR INSERT TO authenticated
  WITH CHECK (publisher_id = auth.uid());
CREATE POLICY "plugins publisher update" ON public.plugins FOR UPDATE TO authenticated
  USING (publisher_id = auth.uid()) WITH CHECK (publisher_id = auth.uid());
CREATE POLICY "plugins publisher delete" ON public.plugins FOR DELETE TO authenticated
  USING (publisher_id = auth.uid());

-- Plugin versions
CREATE TABLE IF NOT EXISTS public.plugin_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id uuid NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  version text NOT NULL,
  changelog text,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  entry_url text,
  permissions text[] NOT NULL DEFAULT '{}',
  min_app_version text,
  is_stable boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plugin_id, version)
);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin ON public.plugin_versions(plugin_id, published_at DESC);

GRANT SELECT ON public.plugin_versions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plugin_versions TO authenticated;
GRANT ALL ON public.plugin_versions TO service_role;
ALTER TABLE public.plugin_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plugin_versions public read" ON public.plugin_versions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.plugins p WHERE p.id = plugin_id AND p.is_public AND p.status = 'published'));
CREATE POLICY "plugin_versions publisher all" ON public.plugin_versions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plugins p WHERE p.id = plugin_id AND p.publisher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plugins p WHERE p.id = plugin_id AND p.publisher_id = auth.uid()));

-- Plugin installations (per workspace)
CREATE TABLE IF NOT EXISTS public.plugin_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plugin_id uuid NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.plugin_versions(id) ON DELETE SET NULL,
  installed_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','error','uninstalled')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_permissions text[] NOT NULL DEFAULT '{}',
  last_error text,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, plugin_id)
);
CREATE INDEX IF NOT EXISTS idx_plugin_installations_ws ON public.plugin_installations(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_installations TO authenticated;
GRANT ALL ON public.plugin_installations TO service_role;
ALTER TABLE public.plugin_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plugin_installations ws members" ON public.plugin_installations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = plugin_installations.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = plugin_installations.workspace_id AND wm.user_id = auth.uid()));

-- Plugin reviews
CREATE TABLE IF NOT EXISTS public.plugin_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id uuid NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  reviewer_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plugin_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_plugin ON public.plugin_reviews(plugin_id, created_at DESC);

GRANT SELECT ON public.plugin_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plugin_reviews TO authenticated;
GRANT ALL ON public.plugin_reviews TO service_role;
ALTER TABLE public.plugin_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plugin_reviews public read" ON public.plugin_reviews FOR SELECT USING (true);
CREATE POLICY "plugin_reviews self write" ON public.plugin_reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid());
CREATE POLICY "plugin_reviews self update" ON public.plugin_reviews FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid()) WITH CHECK (reviewer_id = auth.uid());
CREATE POLICY "plugin_reviews self delete" ON public.plugin_reviews FOR DELETE TO authenticated
  USING (reviewer_id = auth.uid());

-- Themes
CREATE TABLE IF NOT EXISTS public.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  publisher_id uuid,
  publisher_name text,
  tokens jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_url text,
  icon_url text,
  is_public boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  install_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.themes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.themes TO authenticated;
GRANT ALL ON public.themes TO service_role;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "themes public read" ON public.themes FOR SELECT USING (is_public);
CREATE POLICY "themes publisher all" ON public.themes FOR ALL TO authenticated
  USING (publisher_id = auth.uid()) WITH CHECK (publisher_id = auth.uid());

-- Theme installations
CREATE TABLE IF NOT EXISTS public.theme_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  theme_id uuid NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  installed_by uuid NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, theme_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_installations TO authenticated;
GRANT ALL ON public.theme_installations TO service_role;
ALTER TABLE public.theme_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theme_installations ws members" ON public.theme_installations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = theme_installations.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = theme_installations.workspace_id AND wm.user_id = auth.uid()));

-- White label configs
CREATE TABLE IF NOT EXISTS public.white_label_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  brand_name text,
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  primary_color text,
  accent_color text,
  background_color text,
  custom_domain text,
  support_email text,
  support_url text,
  remove_lovable_branding boolean NOT NULL DEFAULT false,
  custom_css text,
  custom_email_footer text,
  meta_title text,
  meta_description text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.white_label_configs TO authenticated;
GRANT ALL ON public.white_label_configs TO service_role;
ALTER TABLE public.white_label_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "white_label ws members read" ON public.white_label_configs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = white_label_configs.workspace_id AND wm.user_id = auth.uid()));
CREATE POLICY "white_label ws admin write" ON public.white_label_configs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = white_label_configs.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = white_label_configs.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner','admin')));

-- Public custom-domain lookup (needed by the tenant router at request time; brand fields only, no secrets)
CREATE POLICY "white_label custom domain public lookup" ON public.white_label_configs FOR SELECT TO anon
  USING (is_active AND custom_domain IS NOT NULL);
GRANT SELECT ON public.white_label_configs TO anon;

-- Ratings roll-up trigger
CREATE OR REPLACE FUNCTION public.recompute_plugin_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE(NEW.plugin_id, OLD.plugin_id);
  UPDATE public.plugins p SET
    rating_avg = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.plugin_reviews WHERE plugin_id = pid), 0),
    rating_count = (SELECT COUNT(*) FROM public.plugin_reviews WHERE plugin_id = pid)
  WHERE p.id = pid;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_plugin_reviews_rating ON public.plugin_reviews;
CREATE TRIGGER trg_plugin_reviews_rating
AFTER INSERT OR UPDATE OR DELETE ON public.plugin_reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_plugin_rating();

-- Install-count roll-up
CREATE OR REPLACE FUNCTION public.recompute_plugin_installs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE(NEW.plugin_id, OLD.plugin_id);
  UPDATE public.plugins SET install_count = (
    SELECT COUNT(*) FROM public.plugin_installations WHERE plugin_id = pid AND status = 'active'
  ) WHERE id = pid;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_plugin_installs ON public.plugin_installations;
CREATE TRIGGER trg_plugin_installs
AFTER INSERT OR UPDATE OR DELETE ON public.plugin_installations
FOR EACH ROW EXECUTE FUNCTION public.recompute_plugin_installs();

-- updated_at helper (reuse if exists)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_plugins_touch ON public.plugins;
CREATE TRIGGER trg_plugins_touch BEFORE UPDATE ON public.plugins
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_plugin_installations_touch ON public.plugin_installations;
CREATE TRIGGER trg_plugin_installations_touch BEFORE UPDATE ON public.plugin_installations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_themes_touch ON public.themes;
CREATE TRIGGER trg_themes_touch BEFORE UPDATE ON public.themes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_white_label_touch ON public.white_label_configs;
CREATE TRIGGER trg_white_label_touch BEFORE UPDATE ON public.white_label_configs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
