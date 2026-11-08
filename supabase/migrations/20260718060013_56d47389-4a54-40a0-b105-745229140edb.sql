
-- Seed missing meters
INSERT INTO public.usage_meters (code, name, unit, aggregation) VALUES
  ('active_users', 'Active Users', 'count', 'max'),
  ('workspace_members', 'Workspace Members', 'count', 'max'),
  ('whatsapp_numbers', 'WhatsApp Phone Numbers', 'count', 'max'),
  ('contacts', 'Contacts', 'count', 'max'),
  ('messages_received', 'Messages Received', 'count', 'sum'),
  ('broadcast_messages', 'Broadcast Messages', 'count', 'sum'),
  ('campaigns_launched', 'Campaigns Launched', 'count', 'sum'),
  ('ai_requests', 'AI Requests', 'count', 'sum'),
  ('api_calls', 'API Calls', 'count', 'sum'),
  ('workflow_executions', 'Workflow Executions', 'count', 'sum'),
  ('media_storage_bytes', 'Media Storage', 'bytes', 'max'),
  ('bandwidth_bytes', 'Bandwidth', 'bytes', 'sum')
ON CONFLICT (code) DO NOTHING;

-- Alerts / thresholds
CREATE TABLE IF NOT EXISTS public.usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meter_code TEXT NOT NULL,
  threshold_type TEXT NOT NULL DEFAULT 'percent' CHECK (threshold_type IN ('percent','absolute')),
  threshold_value NUMERIC NOT NULL,
  notify_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notify_in_app BOOLEAN NOT NULL DEFAULT true,
  block_on_exceed BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_triggered_value NUMERIC,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_alerts_org_meter ON public.usage_alerts(organization_id, meter_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_alerts TO authenticated;
GRANT ALL ON public.usage_alerts TO service_role;

ALTER TABLE public.usage_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view usage alerts" ON public.usage_alerts
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Members manage usage alerts" ON public.usage_alerts
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

CREATE TRIGGER trg_usage_alerts_updated_at BEFORE UPDATE ON public.usage_alerts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
