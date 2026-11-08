-- Restrict the raw gateway settings table to platform staff and expose a
-- safe, non-sensitive projection to signed-in users through a view.
DROP POLICY IF EXISTS "payment_gateway_settings_select" ON public.payment_gateway_settings;
DROP POLICY IF EXISTS "Anyone can read gateway settings" ON public.payment_gateway_settings;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_gateway_settings' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.payment_gateway_settings', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Only platform staff can read gateway settings"
ON public.payment_gateway_settings
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE VIEW public.payment_gateway_public_settings
WITH (security_invoker = off) AS
SELECT provider_id, enabled, is_default, mode, display_label, adapter_id,
       supported_methods, publishable_key, is_custom
FROM public.payment_gateway_settings;

REVOKE ALL ON public.payment_gateway_public_settings FROM anon;
GRANT SELECT ON public.payment_gateway_public_settings TO authenticated;
GRANT ALL ON public.payment_gateway_public_settings TO service_role;