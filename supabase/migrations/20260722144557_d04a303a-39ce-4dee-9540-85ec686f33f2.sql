
ALTER TABLE public.chatbots
  ADD COLUMN IF NOT EXISTS installed_from_template_id uuid REFERENCES public.chatbot_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installed_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_reason text,
  ADD COLUMN IF NOT EXISTS uninstalled_reason text;

CREATE INDEX IF NOT EXISTS chatbots_installed_template_idx
  ON public.chatbots(installed_from_template_id)
  WHERE installed_from_template_id IS NOT NULL;
