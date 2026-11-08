
CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instagram_account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  chatbot_id uuid,
  session_id uuid,
  provider_message_id text,
  sender_id text,
  recipient_id text,
  event_type text NOT NULL DEFAULT 'message',
  text text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received',
  error text,
  reply_sent boolean NOT NULL DEFAULT false,
  reply_text text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_workspace_created
  ON public.instagram_webhook_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_account
  ON public.instagram_webhook_events(instagram_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_status
  ON public.instagram_webhook_events(status, created_at DESC);

GRANT SELECT ON public.instagram_webhook_events TO authenticated;
GRANT ALL ON public.instagram_webhook_events TO service_role;

ALTER TABLE public.instagram_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ig webhook events select by members"
  ON public.instagram_webhook_events FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
-- No insert/update/delete policies for authenticated: only service_role writes.
