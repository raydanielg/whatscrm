CREATE TABLE public.cookie_consents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted','declined')),
  policy_version text NOT NULL DEFAULT 'v1',
  page_path text,
  referrer text,
  user_agent text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_cookie_consents_visitor ON public.cookie_consents (visitor_id, created_at DESC);

GRANT INSERT ON public.cookie_consents TO anon;
GRANT INSERT ON public.cookie_consents TO authenticated;
GRANT ALL ON public.cookie_consents TO service_role;

ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record their cookie choice"
ON public.cookie_consents FOR INSERT TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE TRIGGER trg_cookie_consents_updated
BEFORE UPDATE ON public.cookie_consents
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();