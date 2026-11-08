-- TikTok (and any future refreshable-token provider) needs a refresh token
-- alongside the existing access token. `access_token` is already
-- application-layer-encrypted before it reaches this table (see
-- token-crypto.server.ts) and locked out of authenticated/anon at the column
-- level (see 20260807085225); `refresh_token` gets the identical treatment
-- rather than a new plaintext field.
ALTER TABLE public.social_channels
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamp with time zone;

REVOKE ALL (refresh_token, refresh_token_expires_at) ON public.social_channels FROM authenticated;
REVOKE ALL (refresh_token, refresh_token_expires_at) ON public.social_channels FROM anon;
GRANT ALL ON public.social_channels TO service_role;
