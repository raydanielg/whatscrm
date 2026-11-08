-- Keep direct Google credentials separate from any legacy connector gateway keys.
CREATE TABLE IF NOT EXISTS public.google_oauth_settings (
  provider_id text PRIMARY KEY CHECK (provider_id = 'google-workspace'),
  client_id_cipher text NOT NULL,
  client_secret_cipher text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_oauth_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_oauth_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.google_oauth_settings TO service_role;
