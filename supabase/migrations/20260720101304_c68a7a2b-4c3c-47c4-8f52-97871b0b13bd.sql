
ALTER TABLE public.whatsapp_form_submissions
  ADD COLUMN IF NOT EXISTS external_message_id text,
  ADD COLUMN IF NOT EXISTS flow_token text,
  ADD COLUMN IF NOT EXISTS raw jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_form_submissions_ext_msg
  ON public.whatsapp_form_submissions(external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_form_submissions_flow_token
  ON public.whatsapp_form_submissions(flow_token)
  WHERE flow_token IS NOT NULL;
