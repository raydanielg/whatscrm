CREATE TABLE IF NOT EXISTS public.user_theme_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_mode text NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light','dark','system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_theme_preferences TO authenticated;
GRANT ALL ON public.user_theme_preferences TO service_role;

ALTER TABLE public.user_theme_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own theme preference"
ON public.user_theme_preferences
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_user_theme_preferences_updated_at ON public.user_theme_preferences;
CREATE TRIGGER update_user_theme_preferences_updated_at
BEFORE UPDATE ON public.user_theme_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();