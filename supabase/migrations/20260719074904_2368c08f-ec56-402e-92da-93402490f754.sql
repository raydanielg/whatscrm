
-- 1. Extend products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS retailer_id TEXT,
  ADD COLUMN IF NOT EXISTS wa_catalog_status TEXT NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS wa_catalog_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wa_catalog_error TEXT,
  ADD COLUMN IF NOT EXISTS wa_visibility TEXT NOT NULL DEFAULT 'published';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_retailer_id ON public.products(workspace_id, retailer_id) WHERE retailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_wa_status ON public.products(workspace_id, wa_catalog_status);

-- 2. Config
CREATE TABLE IF NOT EXISTS public.wa_catalog_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE,
  catalog_id TEXT,
  business_id TEXT,
  phone_number_id TEXT,
  access_token_secret_name TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  auto_sync BOOLEAN NOT NULL DEFAULT false,
  sync_images BOOLEAN NOT NULL DEFAULT true,
  sync_inventory BOOLEAN NOT NULL DEFAULT true,
  sync_prices BOOLEAN NOT NULL DEFAULT true,
  default_category TEXT,
  last_full_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_catalog_config TO authenticated;
GRANT ALL ON public.wa_catalog_config TO service_role;
ALTER TABLE public.wa_catalog_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws manage wa_catalog_config" ON public.wa_catalog_config FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- 3. Sync log
CREATE TABLE IF NOT EXISTS public.wa_catalog_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  total_items INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by UUID
);
CREATE INDEX IF NOT EXISTS idx_wa_sync_log_ws ON public.wa_catalog_sync_log(workspace_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_catalog_sync_log TO authenticated;
GRANT ALL ON public.wa_catalog_sync_log TO service_role;
ALTER TABLE public.wa_catalog_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read wa_catalog_sync_log" ON public.wa_catalog_sync_log FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- 4. Collections
CREATE TABLE IF NOT EXISTS public.wa_catalog_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  wa_set_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_collections_ws ON public.wa_catalog_collections(workspace_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_catalog_collections TO authenticated;
GRANT ALL ON public.wa_catalog_collections TO service_role;
ALTER TABLE public.wa_catalog_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws manage wa_collections" ON public.wa_catalog_collections FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.wa_catalog_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.wa_catalog_collections(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collection_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_collection_items_col ON public.wa_catalog_collection_items(collection_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_catalog_collection_items TO authenticated;
GRANT ALL ON public.wa_catalog_collection_items TO service_role;
ALTER TABLE public.wa_catalog_collection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws manage wa_collection_items" ON public.wa_catalog_collection_items FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- 5. Analytics
CREATE TABLE IF NOT EXISTS public.wa_catalog_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  date DATE NOT NULL,
  product_id UUID,
  views INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  add_to_cart INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, date, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_analytics_ws ON public.wa_catalog_analytics_daily(workspace_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_catalog_analytics_daily TO authenticated;
GRANT ALL ON public.wa_catalog_analytics_daily TO service_role;
ALTER TABLE public.wa_catalog_analytics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read wa_analytics" ON public.wa_catalog_analytics_daily FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
