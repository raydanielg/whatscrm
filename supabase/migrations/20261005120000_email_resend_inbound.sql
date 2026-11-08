-- Email channel: Resend outbound + signed inbound webhook.
-- Adds per-account secrets (kept out of client reads) and the 'resend' provider.

ALTER TABLE public.email_accounts DROP CONSTRAINT IF EXISTS email_accounts_provider_chk;
ALTER TABLE public.email_accounts
  ADD CONSTRAINT email_accounts_provider_chk CHECK (provider IN ('lovable', 'smtp', 'resend'));

ALTER TABLE public.email_accounts ADD COLUMN IF NOT EXISTS webhook_secret text;
ALTER TABLE public.email_accounts ADD COLUMN IF NOT EXISTS api_key_ciphertext text;

-- Hide the webhook secret and API key from browser clients; server code reads
-- them with the service role.
REVOKE SELECT ON public.email_accounts FROM authenticated;
REVOKE SELECT ON public.email_accounts FROM anon;
GRANT SELECT (
  id, workspace_id, provider, display_name, from_email, from_name, reply_to,
  inbound_address, status, status_reason, metadata, connected_at, connected_by,
  last_verified_at, created_at, updated_at
) ON public.email_accounts TO authenticated;
