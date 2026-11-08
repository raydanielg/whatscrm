-- One-time, server-only OAuth state for direct Google Workspace authorization.
CREATE TABLE IF NOT EXISTS public.integration_oauth_states (
  state uuid PRIMARY KEY,
  provider_id text NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_origin text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS integration_oauth_states_expires_idx
  ON public.integration_oauth_states (expires_at);
ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_oauth_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_oauth_states TO service_role;
