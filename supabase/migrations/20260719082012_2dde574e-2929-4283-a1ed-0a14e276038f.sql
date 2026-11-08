
CREATE TABLE public.commerce_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  code text,
  name text NOT NULL,
  description text,
  promo_type text NOT NULL DEFAULT 'coupon' CHECK (promo_type IN ('coupon','automatic')),
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed','free_shipping','bxgy','bundle')),
  percent_off numeric(5,2),
  amount_off_cents integer,
  currency text NOT NULL DEFAULT 'USD',
  min_order_cents integer,
  max_discount_cents integer,
  buy_qty integer,
  get_qty integer,
  get_discount_percent numeric(5,2) DEFAULT 100,
  get_product_ids uuid[] NOT NULL DEFAULT '{}',
  bundle_product_ids uuid[] NOT NULL DEFAULT '{}',
  bundle_price_cents integer,
  applies_to text NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','products','categories','brands')),
  target_ids uuid[] NOT NULL DEFAULT '{}',
  customer_scope text NOT NULL DEFAULT 'all' CHECK (customer_scope IN ('all','specific','segments')),
  customer_ids uuid[] NOT NULL DEFAULT '{}',
  segment_ids uuid[] NOT NULL DEFAULT '{}',
  campaign_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  usage_limit_per_customer integer,
  times_redeemed integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_stackable boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_apply boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

CREATE INDEX idx_commerce_promotions_workspace ON public.commerce_promotions(workspace_id);
CREATE INDEX idx_commerce_promotions_active ON public.commerce_promotions(workspace_id, is_active, starts_at, ends_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_promotions TO authenticated;
GRANT ALL ON public.commerce_promotions TO service_role;
ALTER TABLE public.commerce_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promotions workspace access" ON public.commerce_promotions
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TRIGGER trg_commerce_promotions_updated_at BEFORE UPDATE ON public.commerce_promotions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.commerce_promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  promotion_id uuid NOT NULL REFERENCES public.commerce_promotions(id) ON DELETE CASCADE,
  order_id uuid,
  contact_id uuid,
  code_used text,
  amount_off_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_promo_redemptions_promo ON public.commerce_promotion_redemptions(promotion_id);
CREATE INDEX idx_promo_redemptions_workspace ON public.commerce_promotion_redemptions(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_promotion_redemptions TO authenticated;
GRANT ALL ON public.commerce_promotion_redemptions TO service_role;
ALTER TABLE public.commerce_promotion_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo redemptions workspace access" ON public.commerce_promotion_redemptions
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
