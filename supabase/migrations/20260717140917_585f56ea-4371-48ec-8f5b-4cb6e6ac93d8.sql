
CREATE TABLE IF NOT EXISTS public.ai_settings (
  workspace_id uuid PRIMARY KEY,
  default_provider_id uuid REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  default_model text,
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 1024,
  organization_prompt text,
  workspace_prompt text,
  system_prompt text,
  allowed_roles text[] NOT NULL DEFAULT ARRAY['owner','admin','member']::text[],
  daily_request_limit integer,
  monthly_request_limit integer,
  daily_token_limit bigint,
  monthly_token_limit bigint,
  monthly_cost_limit_usd numeric,
  per_user_daily_limit integer,
  moderation_enabled boolean NOT NULL DEFAULT true,
  moderation_blocklist text[] NOT NULL DEFAULT ARRAY[]::text[],
  moderation_categories text[] NOT NULL DEFAULT ARRAY['hate','sexual','violence','self_harm']::text[],
  redact_pii boolean NOT NULL DEFAULT true,
  log_prompts boolean NOT NULL DEFAULT true,
  log_responses boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 90,
  audit_enabled boolean NOT NULL DEFAULT true,
  training_opt_out boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_settings members read" ON public.ai_settings;
CREATE POLICY "ai_settings members read" ON public.ai_settings
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "ai_settings admins write" ON public.ai_settings;
CREATE POLICY "ai_settings admins write" ON public.ai_settings
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  target text,
  changes jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_workspace_created ON public.ai_audit_logs (workspace_id, created_at DESC);

GRANT SELECT, INSERT ON public.ai_audit_logs TO authenticated;
GRANT ALL ON public.ai_audit_logs TO service_role;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_audit_logs admins read" ON public.ai_audit_logs;
CREATE POLICY "ai_audit_logs admins read" ON public.ai_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

DROP POLICY IF EXISTS "ai_audit_logs admins insert" ON public.ai_audit_logs;
CREATE POLICY "ai_audit_logs admins insert" ON public.ai_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE OR REPLACE FUNCTION public.ai_settings_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_settings_touch_trg ON public.ai_settings;
CREATE TRIGGER ai_settings_touch_trg BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.ai_settings_touch();
