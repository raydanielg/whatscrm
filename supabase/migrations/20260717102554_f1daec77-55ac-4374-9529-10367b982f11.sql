
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'YYYY-MM-DD',
  ADD COLUMN IF NOT EXISTS time_format text NOT NULL DEFAULT '24h',
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT jsonb_build_object(
    'email_marketing', true,
    'email_product', true,
    'email_security', true,
    'push_new_message', true,
    'push_mentions', true,
    'push_assignments', true,
    'digest_frequency', 'weekly'
  );

DROP POLICY IF EXISTS "Users insert own sessions" ON public.sessions;
CREATE POLICY "Users insert own sessions" ON public.sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
