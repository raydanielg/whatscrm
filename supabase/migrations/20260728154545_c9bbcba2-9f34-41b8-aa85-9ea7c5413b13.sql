-- ============ E-COMMERCE CONNECTIONS ============
CREATE TABLE public.ecommerce_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('shopify','woocommerce','wordpress','custom')),
  name text NOT NULL,
  store_url text NOT NULL,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','error','syncing')),
  last_error text,
  last_sync_at timestamptz,
  products_synced integer NOT NULL DEFAULT 0,
  orders_synced integer NOT NULL DEFAULT 0,
  customers_synced integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ecom_conn_ws ON public.ecommerce_connections(workspace_id);

CREATE TABLE public.ecommerce_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.ecommerce_connections(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  resource text NOT NULL,
  direction text NOT NULL DEFAULT 'pull',
  status text NOT NULL DEFAULT 'running',
  items_processed integer NOT NULL DEFAULT 0,
  items_failed integer NOT NULL DEFAULT 0,
  message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX idx_ecom_logs_conn ON public.ecommerce_sync_logs(connection_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecommerce_connections TO authenticated;
GRANT ALL ON public.ecommerce_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecommerce_sync_logs TO authenticated;
GRANT ALL ON public.ecommerce_sync_logs TO service_role;
ALTER TABLE public.ecommerce_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecommerce_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage ecommerce connections" ON public.ecommerce_connections FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "ws members manage ecommerce sync logs" ON public.ecommerce_sync_logs FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- ============ SOCIAL PUBLISHING ============
CREATE TABLE public.social_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','linkedin','x','tiktok')),
  name text NOT NULL,
  external_id text,
  username text,
  avatar_url text,
  access_token text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','expired','error','disconnected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_social_channels_ws ON public.social_channels(workspace_id);

CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  caption text NOT NULL DEFAULT '',
  media_urls text[] NOT NULL DEFAULT '{}',
  link_url text,
  first_comment text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','publishing','published','failed','cancelled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_social_posts_ws ON public.social_posts(workspace_id, scheduled_at DESC);

CREATE TABLE public.social_post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.social_channels(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','publishing','published','failed','skipped')),
  external_post_id text,
  permalink text,
  error text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, channel_id)
);
CREATE INDEX idx_social_targets_post ON public.social_post_targets(post_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_channels TO authenticated;
GRANT ALL ON public.social_channels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_targets TO authenticated;
GRANT ALL ON public.social_post_targets TO service_role;
ALTER TABLE public.social_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage social channels" ON public.social_channels FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "ws members manage social posts" ON public.social_posts FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "ws members manage social post targets" ON public.social_post_targets FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- ============ DIGITAL BUSINESS CARDS ============
CREATE TABLE public.vcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  contact_id uuid,
  slug text NOT NULL UNIQUE,
  full_name text NOT NULL,
  job_title text,
  company text,
  phone text,
  whatsapp text,
  email text,
  website text,
  address text,
  bio text,
  avatar_url text,
  cover_url text,
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT true,
  view_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vcards_ws ON public.vcards(workspace_id);

CREATE TABLE public.vcard_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vcard_id uuid NOT NULL REFERENCES public.vcards(id) ON DELETE CASCADE,
  referrer text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vcard_views_card ON public.vcard_views(vcard_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vcards TO authenticated;
GRANT SELECT ON public.vcards TO anon;
GRANT ALL ON public.vcards TO service_role;
GRANT SELECT, INSERT ON public.vcard_views TO authenticated;
GRANT SELECT, INSERT ON public.vcard_views TO anon;
GRANT ALL ON public.vcard_views TO service_role;
ALTER TABLE public.vcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vcard_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage vcards" ON public.vcards FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "public vcards readable" ON public.vcards FOR SELECT TO anon, authenticated USING (is_public = true);
CREATE POLICY "vcard views insert" ON public.vcard_views FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "vcard views readable by ws" ON public.vcard_views FOR SELECT TO authenticated
  USING (vcard_id IN (SELECT id FROM public.vcards WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));

-- updated_at triggers
CREATE TRIGGER trg_ecom_conn_updated BEFORE UPDATE ON public.ecommerce_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_social_channels_updated BEFORE UPDATE ON public.social_channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_social_posts_updated BEFORE UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_social_targets_updated BEFORE UPDATE ON public.social_post_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_vcards_updated BEFORE UPDATE ON public.vcards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
