
-- Messenger accounts (Facebook Pages connected for Messenger)
CREATE TABLE public.messenger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  page_name text,
  category text,
  profile_picture_url text,
  access_token_ciphertext text NOT NULL,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'connected',
  status_reason text,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, page_id)
);

CREATE INDEX idx_messenger_accounts_workspace ON public.messenger_accounts(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messenger_accounts TO authenticated;
GRANT ALL ON public.messenger_accounts TO service_role;

ALTER TABLE public.messenger_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messenger_accounts by workspace member"
  ON public.messenger_accounts
  TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_messenger_accounts_updated
  BEFORE UPDATE ON public.messenger_accounts
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- OAuth state (single-use CSRF token)
CREATE TABLE public.messenger_oauth_states (
  state text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  return_to text NOT NULL DEFAULT '/settings',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

GRANT ALL ON public.messenger_oauth_states TO service_role;
ALTER TABLE public.messenger_oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only (matches instagram_oauth_states pattern).
