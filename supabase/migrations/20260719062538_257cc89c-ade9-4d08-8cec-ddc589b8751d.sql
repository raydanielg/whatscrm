
-- Categories
CREATE TABLE public.ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  parent_id uuid REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#A4161A',
  icon text,
  default_priority text DEFAULT 'normal',
  default_sla_policy_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_categories TO authenticated;
GRANT ALL ON public.ticket_categories TO service_role;
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage ticket_categories" ON public.ticket_categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_categories.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_categories.workspace_id AND wm.user_id = auth.uid()));

-- Macros
CREATE TABLE public.ticket_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  body text NOT NULL,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{type:'set_status',value:'resolved'},...]
  tags text[] DEFAULT '{}',
  category_id uuid REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  is_shared boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_macros TO authenticated;
GRANT ALL ON public.ticket_macros TO service_role;
ALTER TABLE public.ticket_macros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage ticket_macros" ON public.ticket_macros
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_macros.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_macros.workspace_id AND wm.user_id = auth.uid()));

-- Watchers
CREATE TABLE public.ticket_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_watchers TO authenticated;
GRANT ALL ON public.ticket_watchers TO service_role;
ALTER TABLE public.ticket_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage ticket_watchers" ON public.ticket_watchers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_watchers.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_watchers.workspace_id AND wm.user_id = auth.uid()));

-- Escalations
CREATE TABLE public.ticket_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1,
  reason text,
  escalated_from uuid,
  escalated_to uuid,
  escalated_to_team uuid,
  auto boolean DEFAULT false,
  resolved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_escalations TO authenticated;
GRANT ALL ON public.ticket_escalations TO service_role;
ALTER TABLE public.ticket_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage ticket_escalations" ON public.ticket_escalations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_escalations.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_escalations.workspace_id AND wm.user_id = auth.uid()));

-- Per-ticket SLA tracking
CREATE TABLE public.ticket_sla_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sla_policy_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  first_response_due_at timestamptz,
  next_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_response_breached boolean DEFAULT false,
  resolution_breached boolean DEFAULT false,
  paused boolean DEFAULT false,
  paused_at timestamptz,
  total_pause_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_sla_tracking TO authenticated;
GRANT ALL ON public.ticket_sla_tracking TO service_role;
ALTER TABLE public.ticket_sla_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage ticket_sla_tracking" ON public.ticket_sla_tracking
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_sla_tracking.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_sla_tracking.workspace_id AND wm.user_id = auth.uid()));

-- CSAT surveys (templates)
CREATE TABLE public.csat_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  question text NOT NULL DEFAULT 'How would you rate this support experience?',
  scale text NOT NULL DEFAULT 'stars_5', -- stars_5|nps_10|thumbs
  follow_up_question text,
  send_on text NOT NULL DEFAULT 'resolved', -- resolved|closed
  delay_minutes integer DEFAULT 0,
  channel text NOT NULL DEFAULT 'email', -- email|whatsapp|in_app
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.csat_surveys TO authenticated;
GRANT ALL ON public.csat_surveys TO service_role;
ALTER TABLE public.csat_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage csat_surveys" ON public.csat_surveys
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = csat_surveys.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = csat_surveys.workspace_id AND wm.user_id = auth.uid()));

-- CSAT responses
CREATE TABLE public.csat_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  survey_id uuid REFERENCES public.csat_surveys(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id uuid,
  agent_id uuid,
  rating integer,
  score_type text, -- csat|nps|thumbs
  comment text,
  sentiment text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.csat_responses TO authenticated;
GRANT ALL ON public.csat_responses TO service_role;
ALTER TABLE public.csat_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage csat_responses" ON public.csat_responses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = csat_responses.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = csat_responses.workspace_id AND wm.user_id = auth.uid()));

-- Add optional category ref to conversations (soft link)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ticket_category_id uuid REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ticket_type text,
  ADD COLUMN IF NOT EXISTS escalation_level integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ticket_sla_tracking_workspace ON public.ticket_sla_tracking(workspace_id, resolution_due_at) WHERE resolution_breached = false;
CREATE INDEX IF NOT EXISTS idx_ticket_escalations_ticket ON public.ticket_escalations(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_watchers_ticket ON public.ticket_watchers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_csat_responses_workspace ON public.csat_responses(workspace_id, submitted_at DESC);

-- updated_at triggers (reuse existing function if present)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    EXECUTE 'CREATE TRIGGER trg_ticket_categories_updated BEFORE UPDATE ON public.ticket_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    EXECUTE 'CREATE TRIGGER trg_ticket_macros_updated BEFORE UPDATE ON public.ticket_macros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    EXECUTE 'CREATE TRIGGER trg_ticket_sla_tracking_updated BEFORE UPDATE ON public.ticket_sla_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    EXECUTE 'CREATE TRIGGER trg_csat_surveys_updated BEFORE UPDATE ON public.csat_surveys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END $$;
