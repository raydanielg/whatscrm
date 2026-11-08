CREATE TABLE IF NOT EXISTS public.payment_gateway_settings (
  provider_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox','live')),
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_gateway_settings TO authenticated;
GRANT ALL ON public.payment_gateway_settings TO service_role;

ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read gateway settings" ON public.payment_gateway_settings;
CREATE POLICY "Authenticated can read gateway settings"
ON public.payment_gateway_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins manage gateway settings" ON public.payment_gateway_settings;
CREATE POLICY "Super admins manage gateway settings"
ON public.payment_gateway_settings FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_payment_gateway_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_payment_gateway_settings ON public.payment_gateway_settings;
CREATE TRIGGER trg_touch_payment_gateway_settings
BEFORE UPDATE ON public.payment_gateway_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_payment_gateway_settings();

-- Only one default gateway at a time
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateway_settings_one_default
ON public.payment_gateway_settings ((is_default)) WHERE is_default;

INSERT INTO public.payment_gateway_settings (provider_id, enabled, is_default, mode) VALUES
  ('stripe', true, true, 'sandbox'),
  ('paddle', false, false, 'sandbox'),
  ('manual', true, false, 'live'),
  ('paypal', false, false, 'sandbox'),
  ('lemonsqueezy', false, false, 'sandbox'),
  ('razorpay', false, false, 'sandbox'),
  ('paystack', false, false, 'sandbox'),
  ('flutterwave', false, false, 'sandbox'),
  ('mollie', false, false, 'sandbox'),
  ('mercadopago', false, false, 'sandbox'),
  ('midtrans', false, false, 'sandbox'),
  ('custom', false, false, 'sandbox')
ON CONFLICT (provider_id) DO NOTHING;