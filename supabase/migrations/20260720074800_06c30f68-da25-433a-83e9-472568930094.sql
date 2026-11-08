
CREATE TABLE public.wa_qr_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.whatsapp_qr_sessions(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text,
  status text NOT NULL DEFAULT 'received',
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT wa_qr_webhook_deliveries_event_id_unique UNIQUE (event_id)
);

CREATE INDEX idx_wa_qr_webhook_session ON public.wa_qr_webhook_deliveries(session_id, received_at DESC);
CREATE INDEX idx_wa_qr_webhook_type ON public.wa_qr_webhook_deliveries(event_type, received_at DESC);
CREATE INDEX idx_wa_qr_webhook_status ON public.wa_qr_webhook_deliveries(status, received_at DESC);

GRANT SELECT ON public.wa_qr_webhook_deliveries TO authenticated;
GRANT ALL  ON public.wa_qr_webhook_deliveries TO service_role;

ALTER TABLE public.wa_qr_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their workspace deliveries"
  ON public.wa_qr_webhook_deliveries FOR SELECT
  TO authenticated
  USING (workspace_id IS NULL OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = wa_qr_webhook_deliveries.workspace_id
      AND wm.user_id = auth.uid()
  ));
