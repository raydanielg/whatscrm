-- Credential tables are server-only. Browser/API roles cannot read tokens.
CREATE TABLE public.platform_connector_settings (
  provider_id text PRIMARY KEY CHECK (provider_id = 'google-workspace'),
  client_key_cipher text NOT NULL,
  backend_key_cipher text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.installed_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  account_email text NOT NULL,
  connection_key_cipher text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','needs_reconnect','error')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, provider_id, user_id)
);
ALTER TABLE public.platform_connector_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installed_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_connector_settings, public.installed_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_connector_settings, public.installed_integrations TO service_role;
GRANT ALL ON public.installed_integrations TO service_role;
