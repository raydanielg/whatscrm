-- Optional email delivery for CRM and project task reminders.
ALTER TABLE public.task_reminder_settings
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false;

-- Separate from the in-app logs so either delivery channel can retry independently.
CREATE TABLE IF NOT EXISTS public.task_reminder_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('crm', 'project')),
  task_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lead', 'due', 'overdue')),
  offset_minutes integer NOT NULL CHECK (offset_minutes >= 0),
  due_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, task_id, user_id, kind, offset_minutes, due_key)
);
CREATE INDEX IF NOT EXISTS task_reminder_email_log_task_idx
  ON public.task_reminder_email_log(source, task_id);
ALTER TABLE public.task_reminder_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_reminder_email_log FROM anon, authenticated;
GRANT ALL ON public.task_reminder_email_log TO service_role;

-- Make the new preference visible to PostgREST without a service restart.
NOTIFY pgrst, 'reload schema';
