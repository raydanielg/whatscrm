
-- Automation type enum
DO $$ BEGIN
  CREATE TYPE public.ai_automation_type AS ENUM (
    'create_task','suggest_followup','assign_agent','move_pipeline_stage',
    'create_note','meeting_summary','crm_notes','suggest_tags','generate_labels',
    'update_customer_status','recommend_campaign','detect_upsell'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_suggestion_status AS ENUM ('pending','approved','applied','rejected','failed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Config table
CREATE TABLE IF NOT EXISTS public.ai_automation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  automation_type public.ai_automation_type NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  require_confirmation boolean NOT NULL DEFAULT true,
  auto_apply_threshold numeric(3,2),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, automation_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_automation_config TO authenticated;
GRANT ALL ON public.ai_automation_config TO service_role;
ALTER TABLE public.ai_automation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read automation config" ON public.ai_automation_config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ai_automation_config.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "admins manage automation config" ON public.ai_automation_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ai_automation_config.workspace_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ai_automation_config.workspace_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')));

-- Suggestions table
CREATE TABLE IF NOT EXISTS public.ai_automation_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  automation_type public.ai_automation_type NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  title text NOT NULL,
  summary text,
  rationale text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(3,2),
  status public.ai_suggestion_status NOT NULL DEFAULT 'pending',
  requires_confirmation boolean NOT NULL DEFAULT true,
  created_by_ai boolean NOT NULL DEFAULT true,
  suggested_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  applied_at timestamptz,
  applied_result jsonb,
  error_message text,
  model text,
  tokens_used integer DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_sug_ws_status ON public.ai_automation_suggestions (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_sug_entity ON public.ai_automation_suggestions (workspace_id, entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_automation_suggestions TO authenticated;
GRANT ALL ON public.ai_automation_suggestions TO service_role;
ALTER TABLE public.ai_automation_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read suggestions" ON public.ai_automation_suggestions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ai_automation_suggestions.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "members write suggestions" ON public.ai_automation_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ai_automation_suggestions.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "members update suggestions" ON public.ai_automation_suggestions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ai_automation_suggestions.workspace_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ai_automation_suggestions.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "admins delete suggestions" ON public.ai_automation_suggestions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ai_automation_suggestions.workspace_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')));

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_ai_automation_config_touch ON public.ai_automation_config;
CREATE TRIGGER trg_ai_automation_config_touch BEFORE UPDATE ON public.ai_automation_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_ai_automation_suggestions_touch ON public.ai_automation_suggestions;
CREATE TRIGGER trg_ai_automation_suggestions_touch BEFORE UPDATE ON public.ai_automation_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
