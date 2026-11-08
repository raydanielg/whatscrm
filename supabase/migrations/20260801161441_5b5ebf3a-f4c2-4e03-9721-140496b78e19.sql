CREATE TABLE public.telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bot_id text NOT NULL,
  bot_username text,
  bot_name text,
  bot_token_ciphertext text NOT NULL,
  webhook_secret text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  status_reason text,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, bot_id)
);

CREATE INDEX idx_telegram_accounts_workspace ON public.telegram_accounts(workspace_id);
CREATE INDEX idx_telegram_accounts_bot ON public.telegram_accounts(bot_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;

ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_accounts by workspace member"
  ON public.telegram_accounts
  TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_telegram_accounts_updated
  BEFORE UPDATE ON public.telegram_accounts
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();