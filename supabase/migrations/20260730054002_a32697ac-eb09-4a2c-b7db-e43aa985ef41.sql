ALTER TABLE public.cookie_consents
  ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.cookie_consents DROP CONSTRAINT IF EXISTS cookie_consents_decision_check;
ALTER TABLE public.cookie_consents
  ADD CONSTRAINT cookie_consents_decision_check
  CHECK (decision = ANY (ARRAY['accepted'::text, 'declined'::text, 'custom'::text]));