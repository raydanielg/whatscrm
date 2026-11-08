ALTER TABLE public.plan_gateway_prices
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS verification_message text,
  ADD COLUMN IF NOT EXISTS verified_amount_cents integer,
  ADD COLUMN IF NOT EXISTS verified_currency text,
  ADD COLUMN IF NOT EXISTS verified_interval text;

ALTER TABLE public.plan_gateway_prices
  DROP CONSTRAINT IF EXISTS plan_gateway_prices_verification_status_check;

ALTER TABLE public.plan_gateway_prices
  ADD CONSTRAINT plan_gateway_prices_verification_status_check
  CHECK (verification_status IS NULL OR verification_status IN ('verified','mismatch','missing','error','unsupported','skipped'));