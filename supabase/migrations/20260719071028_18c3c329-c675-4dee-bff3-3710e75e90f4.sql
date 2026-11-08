
-- Extend csat_surveys
ALTER TABLE public.csat_surveys
  ADD COLUMN IF NOT EXISTS survey_type text NOT NULL DEFAULT 'csat',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS follow_up_survey_id uuid REFERENCES public.csat_surveys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
  ADD COLUMN IF NOT EXISTS target_audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS automation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS thank_you_message text;

CREATE INDEX IF NOT EXISTS idx_csat_surveys_workspace_active ON public.csat_surveys(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_csat_surveys_type ON public.csat_surveys(workspace_id, survey_type);

-- Extend csat_responses
ALTER TABLE public.csat_responses
  ADD COLUMN IF NOT EXISTS nps_score integer,
  ADD COLUMN IF NOT EXISTS ces_score integer,
  ADD COLUMN IF NOT EXISTS responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS follow_up_response_id uuid REFERENCES public.csat_responses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_csat_responses_survey ON public.csat_responses(survey_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_csat_responses_agent ON public.csat_responses(workspace_id, agent_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_csat_responses_department ON public.csat_responses(workspace_id, department_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_csat_responses_nps ON public.csat_responses(workspace_id, nps_score) WHERE nps_score IS NOT NULL;

-- Survey templates
CREATE TABLE IF NOT EXISTS public.survey_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  is_system boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  description text,
  survey_type text NOT NULL DEFAULT 'csat',
  category text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon text,
  usage_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_templates TO authenticated;
GRANT ALL ON public.survey_templates TO service_role;
ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members read templates" ON public.survey_templates FOR SELECT TO authenticated
  USING (is_system OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = survey_templates.workspace_id AND wm.user_id = auth.uid()));
CREATE POLICY "workspace members write templates" ON public.survey_templates FOR ALL TO authenticated
  USING (workspace_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = survey_templates.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (workspace_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = survey_templates.workspace_id AND wm.user_id = auth.uid()));
CREATE TRIGGER trg_survey_templates_updated BEFORE UPDATE ON public.survey_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Survey automations
CREATE TABLE IF NOT EXISTS public.survey_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  survey_id uuid NOT NULL REFERENCES public.csat_surveys(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  trigger_event text,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel text NOT NULL DEFAULT 'email',
  delay_minutes integer NOT NULL DEFAULT 0,
  workflow_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_automations TO authenticated;
GRANT ALL ON public.survey_automations TO service_role;
ALTER TABLE public.survey_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage survey_automations" ON public.survey_automations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = survey_automations.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = survey_automations.workspace_id AND wm.user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_survey_automations_ws ON public.survey_automations(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_survey_automations_trigger ON public.survey_automations(trigger_type, trigger_event) WHERE is_active;
CREATE TRIGGER trg_survey_automations_updated BEFORE UPDATE ON public.survey_automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed system templates
INSERT INTO public.survey_templates (is_system, name, description, survey_type, category, questions, default_config, icon)
VALUES
  (true, 'Post-Ticket CSAT', 'Classic 5-star rating sent after ticket resolution.', 'csat', 'support',
    '[{"id":"rating","type":"stars_5","label":"How would you rate this support experience?","required":true},{"id":"comment","type":"text","label":"Tell us more (optional)","required":false}]'::jsonb,
    '{"send_on":"resolved","delay_minutes":0}'::jsonb, 'star'),
  (true, 'NPS — Product Loyalty', 'Standard 0–10 NPS question with reason.', 'nps', 'product',
    '[{"id":"nps","type":"nps","label":"How likely are you to recommend us to a friend or colleague?","required":true},{"id":"reason","type":"text","label":"What is the primary reason for your score?","required":false}]'::jsonb,
    '{"send_on":"manual"}'::jsonb, 'trending-up'),
  (true, 'CES — Effort Score', 'Measures how easy it was to get help.', 'ces', 'support',
    '[{"id":"ces","type":"ces","label":"The company made it easy to handle my issue.","required":true},{"id":"comment","type":"text","label":"Anything we can improve?","required":false}]'::jsonb,
    '{"send_on":"resolved"}'::jsonb, 'gauge'),
  (true, 'Emoji Pulse', 'Quick emoji reaction survey.', 'csat', 'pulse',
    '[{"id":"mood","type":"emoji_5","label":"How was your experience today?","required":true}]'::jsonb,
    '{"send_on":"manual"}'::jsonb, 'smile'),
  (true, 'Post-Purchase Feedback', 'Rating + written review after order.', 'csat', 'ecommerce',
    '[{"id":"rating","type":"stars_5","label":"How satisfied are you with your purchase?","required":true},{"id":"review","type":"text","label":"Write a review","required":false}]'::jsonb,
    '{"send_on":"purchase"}'::jsonb, 'shopping-cart'),
  (true, 'Agent Rating', 'Rate the agent who helped you.', 'csat', 'agent',
    '[{"id":"agent_rating","type":"stars_5","label":"How would you rate the agent who helped you?","required":true},{"id":"comment","type":"text","label":"Additional feedback","required":false}]'::jsonb,
    '{"send_on":"resolved","scope":"agent"}'::jsonb, 'user-check')
ON CONFLICT DO NOTHING;
