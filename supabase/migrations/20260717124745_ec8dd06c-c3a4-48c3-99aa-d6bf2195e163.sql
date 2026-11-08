ALTER TABLE public.wa_templates
  ADD COLUMN IF NOT EXISTS versions jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_wa_templates_lookup
  ON public.wa_templates(workspace_id, channel_account_id, category, status);