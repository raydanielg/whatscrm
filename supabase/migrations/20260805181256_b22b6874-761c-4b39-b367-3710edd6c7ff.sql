ALTER TABLE public.payment_gateway_settings
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS adapter_id text,
  ADD COLUMN IF NOT EXISTS publishable_key text,
  ADD COLUMN IF NOT EXISTS secret_name text,
  ADD COLUMN IF NOT EXISTS webhook_secret_name text,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS supported_methods text[] NOT NULL DEFAULT ARRAY['card']::text[],
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;