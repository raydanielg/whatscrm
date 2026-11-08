-- Apply after 20261017130000_project_management.sql.
-- Server-only idempotency log for project task deadline notifications.
CREATE TABLE public.pm_task_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_task_id uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lead', 'due', 'overdue')),
  offset_minutes integer NOT NULL CHECK (offset_minutes >= 0),
  due_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pm_task_id, user_id, kind, offset_minutes, due_date)
);

CREATE INDEX pm_task_reminder_log_task_idx ON public.pm_task_reminder_log(pm_task_id);
ALTER TABLE public.pm_task_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pm_task_reminder_log FROM anon, authenticated;
GRANT ALL ON public.pm_task_reminder_log TO service_role;
