
-- Escalation rules per SLA policy
CREATE TABLE public.sla_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  sla_policy_id uuid NOT NULL REFERENCES public.sla_policies(id) ON DELETE CASCADE,
  level int NOT NULL DEFAULT 1,
  name text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'resolution_breach', -- response_warning | response_breach | resolution_warning | resolution_breach
  minutes_offset int NOT NULL DEFAULT 0, -- minutes before(negative)/after(positive) the due date
  notify_supervisor boolean DEFAULT true,
  supervisor_user_ids uuid[] DEFAULT '{}',
  reassign_to_user_id uuid,
  reassign_to_department_id uuid,
  raise_priority boolean DEFAULT false,
  workflow_event text, -- optional workflow trigger event name
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_escalation_rules TO authenticated;
GRANT ALL ON public.sla_escalation_rules TO service_role;
ALTER TABLE public.sla_escalation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_esc_rules_workspace" ON public.sla_escalation_rules FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX idx_sla_esc_rules_policy ON public.sla_escalation_rules(sla_policy_id, is_active);

-- Holiday calendar
CREATE TABLE public.sla_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  holiday_date date NOT NULL,
  recurring_yearly boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_holidays TO authenticated;
GRANT ALL ON public.sla_holidays TO service_role;
ALTER TABLE public.sla_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_holidays_workspace" ON public.sla_holidays FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX idx_sla_holidays_ws ON public.sla_holidays(workspace_id, holiday_date);

-- SLA lifecycle events (feed for Workflow Automation)
CREATE TABLE public.sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  sla_policy_id uuid,
  escalation_rule_id uuid,
  event_type text NOT NULL, -- warning | breach | escalated | reassigned
  level int DEFAULT 0,
  target text, -- response|resolution
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sla_events TO authenticated;
GRANT ALL ON public.sla_events TO service_role;
ALTER TABLE public.sla_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_events_read" ON public.sla_events FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "sla_events_insert" ON public.sla_events FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX idx_sla_events_ticket ON public.sla_events(ticket_id, created_at DESC);

-- Track breach warnings so we don't fire twice
ALTER TABLE public.ticket_sla_tracking
  ADD COLUMN IF NOT EXISTS response_warning_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_warning_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_escalation_level int DEFAULT 0;

-- Realtime for dashboard + countdown
ALTER PUBLICATION supabase_realtime ADD TABLE public.sla_escalation_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sla_holidays;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sla_events;

CREATE TRIGGER trg_sla_esc_rules_updated BEFORE UPDATE ON public.sla_escalation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
