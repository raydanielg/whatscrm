CREATE OR REPLACE FUNCTION public.prune_gateway_webhook_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT COALESCE(public.is_super_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.payment_gateway_webhook_deliveries
  WHERE received_at < now() - interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_gateway_webhook_deliveries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_gateway_webhook_deliveries() TO service_role;
