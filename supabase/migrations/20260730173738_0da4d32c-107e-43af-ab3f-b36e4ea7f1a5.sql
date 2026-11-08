ALTER TABLE public.whatsapp_auto_replies
  ADD COLUMN IF NOT EXISTS min_confidence numeric(4,3) NOT NULL DEFAULT 0.600;

ALTER TABLE public.whatsapp_auto_replies
  DROP CONSTRAINT IF EXISTS whatsapp_auto_replies_min_confidence_range;

ALTER TABLE public.whatsapp_auto_replies
  ADD CONSTRAINT whatsapp_auto_replies_min_confidence_range
  CHECK (min_confidence >= 0 AND min_confidence <= 1);