
ALTER TABLE public.bi_scheduled_reports DROP CONSTRAINT IF EXISTS bi_scheduled_reports_delivery_check;
ALTER TABLE public.bi_scheduled_reports
  ADD CONSTRAINT bi_scheduled_reports_delivery_check
  CHECK (delivery = ANY (ARRAY['email','webhook','slack','whatsapp','download']));

ALTER TABLE public.bi_scheduled_reports
  ADD COLUMN IF NOT EXISTS frequency text,
  ADD COLUMN IF NOT EXISTS whatsapp_recipients text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.bi_scheduled_reports DROP CONSTRAINT IF EXISTS bi_scheduled_reports_frequency_check;
ALTER TABLE public.bi_scheduled_reports
  ADD CONSTRAINT bi_scheduled_reports_frequency_check
  CHECK (frequency IS NULL OR frequency = ANY (ARRAY['daily','weekly','monthly','quarterly','yearly','custom']));
