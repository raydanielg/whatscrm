
-- Brands
CREATE TABLE public.commerce_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  logo_url TEXT,
  description TEXT,
  website TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commerce_brands_ws ON public.commerce_brands(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_brands TO authenticated;
GRANT ALL ON public.commerce_brands TO service_role;
ALTER TABLE public.commerce_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage brands" ON public.commerce_brands FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Inventory tracking (stock movements)
CREATE TABLE public.commerce_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT 'default',
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  reorder_quantity INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, location)
);
CREATE INDEX idx_commerce_inventory_ws ON public.commerce_inventory(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_inventory TO authenticated;
GRANT ALL ON public.commerce_inventory TO service_role;
ALTER TABLE public.commerce_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage inventory" ON public.commerce_inventory FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE public.commerce_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  product_id UUID NOT NULL,
  location TEXT NOT NULL DEFAULT 'default',
  movement_type TEXT NOT NULL, -- receive, adjust, sale, return, transfer
  quantity_delta INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commerce_movements_product ON public.commerce_inventory_movements(product_id, created_at DESC);
GRANT SELECT, INSERT ON public.commerce_inventory_movements TO authenticated;
GRANT ALL ON public.commerce_inventory_movements TO service_role;
ALTER TABLE public.commerce_inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members view movements" ON public.commerce_inventory_movements FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "ws members create movements" ON public.commerce_inventory_movements FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Shipping zones & rates
CREATE TABLE public.commerce_shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  countries TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commerce_ship_zones_ws ON public.commerce_shipping_zones(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_shipping_zones TO authenticated;
GRANT ALL ON public.commerce_shipping_zones TO service_role;
ALTER TABLE public.commerce_shipping_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage zones" ON public.commerce_shipping_zones FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE public.commerce_shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  zone_id UUID NOT NULL REFERENCES public.commerce_shipping_zones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate_type TEXT NOT NULL DEFAULT 'flat', -- flat, weight, price, free
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  min_order_total NUMERIC(12,2),
  max_order_total NUMERIC(12,2),
  estimated_days_min INTEGER,
  estimated_days_max INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commerce_ship_rates_zone ON public.commerce_shipping_rates(zone_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_shipping_rates TO authenticated;
GRANT ALL ON public.commerce_shipping_rates TO service_role;
ALTER TABLE public.commerce_shipping_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage rates" ON public.commerce_shipping_rates FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Add brand + inventory columns to products (safe if not exists)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.commerce_brands(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.commerce_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.commerce_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.commerce_payment_links;
