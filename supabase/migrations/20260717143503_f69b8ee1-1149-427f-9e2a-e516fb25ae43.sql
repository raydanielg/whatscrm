
-- Product categories
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text,
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  color text,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prodcat_ws_members" ON public.product_categories FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX prodcat_ws_idx ON public.product_categories(workspace_id);
CREATE TRIGGER prodcat_touch BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Add category_id + status to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_variant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products(category_id);
CREATE INDEX IF NOT EXISTS products_parent_idx ON public.products(parent_product_id);
CREATE INDEX IF NOT EXISTS products_ws_status_idx ON public.products(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_name_trgm ON public.products USING gin (name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_sku_trgm ON public.products USING gin (sku public.gin_trgm_ops);

-- Bundle items
CREATE TABLE public.product_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bundle_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  discount_pct numeric(6,3) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_bundle_items TO authenticated;
GRANT ALL ON public.product_bundle_items TO service_role;
ALTER TABLE public.product_bundle_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bundle_items_ws" ON public.product_bundle_items FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bundle_items_bundle_idx ON public.product_bundle_items(bundle_id);

-- Favorites
CREATE TABLE public.product_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.product_favorites TO authenticated;
GRANT ALL ON public.product_favorites TO service_role;
ALTER TABLE public.product_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prodfav_own" ON public.product_favorites FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX prodfav_ws_user_idx ON public.product_favorites(workspace_id, user_id);

-- Attachments link (reuse files table via generic entity if exists; else lightweight table)
CREATE TABLE public.product_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_attachments TO authenticated;
GRANT ALL ON public.product_attachments TO service_role;
ALTER TABLE public.product_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prodatt_ws" ON public.product_attachments FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX prodatt_product_idx ON public.product_attachments(product_id);
