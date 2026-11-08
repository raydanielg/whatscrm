CREATE TABLE public.plan_gateway_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox','live')),
  external_price_id text,
  external_product_id text,
  checkout_url text,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, provider_id, mode)
);

CREATE INDEX idx_plan_gateway_prices_plan ON public.plan_gateway_prices(plan_id) WHERE enabled;

GRANT SELECT ON public.plan_gateway_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_gateway_prices TO authenticated;
GRANT ALL ON public.plan_gateway_prices TO service_role;

ALTER TABLE public.plan_gateway_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read enabled plan gateway links"
  ON public.plan_gateway_prices FOR SELECT
  USING (enabled = true AND EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.is_active));

CREATE POLICY "Super admins manage plan gateway links"
  ON public.plan_gateway_prices FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER plan_gateway_prices_touch
  BEFORE UPDATE ON public.plan_gateway_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();