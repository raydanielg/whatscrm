CREATE TABLE public.payment_gateway_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  provider_event_id text,
  event_type text,
  status text NOT NULL DEFAULT 'received',
  http_status integer,
  latency_ms integer,
  signature_verified boolean NOT NULL DEFAULT false,
  error_message text,
  request_id text,
  source_ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_gateway_webhook_deliveries TO authenticated;
GRANT ALL ON public.payment_gateway_webhook_deliveries TO service_role;

ALTER TABLE public.payment_gateway_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read gateway webhook deliveries"
ON public.payment_gateway_webhook_deliveries
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE INDEX idx_pgwd_provider_received
  ON public.payment_gateway_webhook_deliveries (provider_id, received_at DESC);
CREATE INDEX idx_pgwd_received
  ON public.payment_gateway_webhook_deliveries (received_at DESC);

CREATE OR REPLACE FUNCTION public.prune_gateway_webhook_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM public.payment_gateway_webhook_deliveries
  WHERE received_at < now() - interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_gateway_webhook_deliveries() FROM anon, authenticated;