
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'broadcast',
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.wa_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS segment_id uuid,
  ADD COLUMN IF NOT EXISTS audience_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS send_window jsonb,
  ADD COLUMN IF NOT EXISTS throttle_per_minute integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS ab_test jsonb,
  ADD COLUMN IF NOT EXISTS respect_opt_out boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_recipients integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replied_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opted_out_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text,
  icon text,
  filter_definition jsonb NOT NULL DEFAULT '{"conditions":[],"logic":"AND"}'::jsonb,
  is_dynamic boolean NOT NULL DEFAULT true,
  member_count integer NOT NULL DEFAULT 0,
  last_computed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_segments TO authenticated;
GRANT ALL ON public.customer_segments TO service_role;
ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segments workspace access" ON public.customer_segments
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_customer_segments_ws ON public.customer_segments(workspace_id);

CREATE TABLE IF NOT EXISTS public.segment_members (
  segment_id uuid NOT NULL REFERENCES public.customer_segments(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.segment_members TO authenticated;
GRANT ALL ON public.segment_members TO service_role;
ALTER TABLE public.segment_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segment members workspace access" ON public.segment_members
  FOR ALL TO authenticated
  USING (segment_id IN (SELECT id FROM public.customer_segments WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())))
  WITH CHECK (segment_id IN (SELECT id FROM public.customer_segments WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));
CREATE INDEX IF NOT EXISTS idx_segment_members_contact ON public.segment_members(contact_id);

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_segment_id_fkey,
  ADD CONSTRAINT campaigns_segment_id_fkey FOREIGN KEY (segment_id)
    REFERENCES public.customer_segments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  variant text,
  status text NOT NULL DEFAULT 'pending',
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  clicked_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign recipients workspace access" ON public.campaign_recipients
  FOR ALL TO authenticated
  USING (campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())))
  WITH CHECK (campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact ON public.campaign_recipients(contact_id);

CREATE TABLE IF NOT EXISTS public.campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_events TO authenticated;
GRANT ALL ON public.campaign_events TO service_role;
ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign events workspace access" ON public.campaign_events
  FOR ALL TO authenticated
  USING (campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())))
  WITH CHECK (campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));
CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign ON public.campaign_events(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  purpose text NOT NULL DEFAULT 'marketing',
  status text NOT NULL DEFAULT 'opted_in',
  source text,
  ip_address text,
  user_agent text,
  proof_url text,
  notes text,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consent records workspace access" ON public.consent_records
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_consent_contact ON public.consent_records(contact_id, channel, purpose);
CREATE INDEX IF NOT EXISTS idx_consent_workspace ON public.consent_records(workspace_id, status);

CREATE TABLE IF NOT EXISTS public.drip_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  trigger_type text NOT NULL DEFAULT 'manual',
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid REFERENCES public.customer_segments(id) ON DELETE SET NULL,
  exit_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  respect_opt_out boolean NOT NULL DEFAULT true,
  enrolled_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drip_sequences TO authenticated;
GRANT ALL ON public.drip_sequences TO service_role;
ALTER TABLE public.drip_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drip sequences workspace access" ON public.drip_sequences
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_drip_sequences_ws ON public.drip_sequences(workspace_id, status);

CREATE TABLE IF NOT EXISTS public.drip_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.drip_sequences(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  step_type text NOT NULL DEFAULT 'message',
  name text,
  delay_seconds integer NOT NULL DEFAULT 0,
  template_id uuid REFERENCES public.wa_templates(id) ON DELETE SET NULL,
  message_body text,
  media_url text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  condition jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drip_steps TO authenticated;
GRANT ALL ON public.drip_steps TO service_role;
ALTER TABLE public.drip_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drip steps workspace access" ON public.drip_steps
  FOR ALL TO authenticated
  USING (sequence_id IN (SELECT id FROM public.drip_sequences WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())))
  WITH CHECK (sequence_id IN (SELECT id FROM public.drip_sequences WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));

CREATE TABLE IF NOT EXISTS public.drip_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.drip_sequences(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  next_run_at timestamptz,
  last_run_at timestamptz,
  completed_at timestamptz,
  exit_reason text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drip_enrollments TO authenticated;
GRANT ALL ON public.drip_enrollments TO service_role;
ALTER TABLE public.drip_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drip enrollments workspace access" ON public.drip_enrollments
  FOR ALL TO authenticated
  USING (sequence_id IN (SELECT id FROM public.drip_sequences WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())))
  WITH CHECK (sequence_id IN (SELECT id FROM public.drip_sequences WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_next ON public.drip_enrollments(next_run_at) WHERE status = 'active';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_customer_segments_updated') THEN
    CREATE TRIGGER trg_customer_segments_updated BEFORE UPDATE ON public.customer_segments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_consent_records_updated') THEN
    CREATE TRIGGER trg_consent_records_updated BEFORE UPDATE ON public.consent_records FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_drip_sequences_updated') THEN
    CREATE TRIGGER trg_drip_sequences_updated BEFORE UPDATE ON public.drip_sequences FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_drip_steps_updated') THEN
    CREATE TRIGGER trg_drip_steps_updated BEFORE UPDATE ON public.drip_steps FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_drip_enrollments_updated') THEN
    CREATE TRIGGER trg_drip_enrollments_updated BEFORE UPDATE ON public.drip_enrollments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.segment_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.consent_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drip_sequences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drip_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drip_enrollments;
