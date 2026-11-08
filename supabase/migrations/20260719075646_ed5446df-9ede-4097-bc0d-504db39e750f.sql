
CREATE TABLE IF NOT EXISTS public.commerce_wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, contact_id, product_id, variant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_wishlists TO authenticated;
GRANT ALL ON public.commerce_wishlists TO service_role;
ALTER TABLE public.commerce_wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wishlist workspace access" ON public.commerce_wishlists
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.commerce_saved_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Saved cart',
  cart_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_saved_carts TO authenticated;
GRANT ALL ON public.commerce_saved_carts TO service_role;
ALTER TABLE public.commerce_saved_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved carts workspace access" ON public.commerce_saved_carts
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

ALTER TABLE public.commerce_carts ADD COLUMN IF NOT EXISTS coupon_code text;
