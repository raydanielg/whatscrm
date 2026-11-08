ALTER TABLE public.payment_gateway_webhook_deliveries
  ADD COLUMN IF NOT EXISTS replayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replay_status text,
  ADD COLUMN IF NOT EXISTS replay_error text,
  ADD COLUMN IF NOT EXISTS replayed_by uuid,
  ADD COLUMN IF NOT EXISTS replay_of_id uuid;

CREATE INDEX IF NOT EXISTS idx_pgwd_provider_received
  ON public.payment_gateway_webhook_deliveries (provider_id, received_at DESC);

GRANT SELECT ON public.payment_gateway_webhook_deliveries TO authenticated;
GRANT ALL ON public.payment_gateway_webhook_deliveries TO service_role;