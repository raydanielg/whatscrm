DROP VIEW IF EXISTS public.payment_gateway_public_settings;

CREATE OR REPLACE FUNCTION public.list_payment_gateway_basics()
RETURNS TABLE (
  provider_id text,
  enabled boolean,
  is_default boolean,
  mode text,
  display_label text,
  adapter_id text,
  supported_methods text[],
  publishable_key text,
  is_custom boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.provider_id, s.enabled, s.is_default, s.mode, s.display_label,
         s.adapter_id, s.supported_methods, s.publishable_key, s.is_custom
  FROM public.payment_gateway_settings s
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.list_payment_gateway_basics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_payment_gateway_basics() TO authenticated, service_role;