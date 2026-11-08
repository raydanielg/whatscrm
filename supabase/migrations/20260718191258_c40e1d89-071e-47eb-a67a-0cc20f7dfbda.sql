
ALTER TABLE public.livechat_routing_rules
  ADD COLUMN IF NOT EXISTS match_language text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS match_vip boolean,
  ADD COLUMN IF NOT EXISTS match_priority text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS custom_conditions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.livechat_visitors
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

ALTER TABLE public.agent_availability
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS departments uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.conversation_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  session_id uuid,
  from_user_id uuid,
  to_user_id uuid,
  to_department_id uuid,
  transfer_type text NOT NULL DEFAULT 'transfer',
  reason text,
  note text,
  performed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_transfers TO authenticated;
GRANT ALL ON public.conversation_transfers TO service_role;
ALTER TABLE public.conversation_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read transfers"
  ON public.conversation_transfers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = conversation_transfers.workspace_id
      AND m.user_id = auth.uid()
  ));

CREATE POLICY "workspace members create transfers"
  ON public.conversation_transfers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = conversation_transfers.workspace_id
      AND m.user_id = auth.uid()
  ) AND performed_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_conv_transfers_conv ON public.conversation_transfers(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_avail_ws_presence ON public.agent_availability(workspace_id, presence);
CREATE INDEX IF NOT EXISTS idx_handoff_queue_ws_status ON public.handoff_queue(workspace_id, status, entered_at);
