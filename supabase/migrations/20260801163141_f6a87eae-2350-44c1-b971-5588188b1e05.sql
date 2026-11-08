CREATE TABLE public.telegram_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  update_id bigint,
  verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received',
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  last_retry_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tg_webhook_events_ws_created ON public.telegram_webhook_events (workspace_id, created_at DESC);
CREATE INDEX idx_tg_webhook_events_account ON public.telegram_webhook_events (account_id, created_at DESC);
CREATE INDEX idx_tg_webhook_events_status ON public.telegram_webhook_events (status);

GRANT SELECT, DELETE ON public.telegram_webhook_events TO authenticated;
GRANT ALL ON public.telegram_webhook_events TO service_role;

ALTER TABLE public.telegram_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view telegram webhook events"
ON public.telegram_webhook_events
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = telegram_webhook_events.workspace_id
      AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "Workspace admins can delete telegram webhook events"
ON public.telegram_webhook_events
FOR DELETE
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = telegram_webhook_events.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','admin')
  )
);

CREATE TRIGGER trg_telegram_webhook_events_updated_at
BEFORE UPDATE ON public.telegram_webhook_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();