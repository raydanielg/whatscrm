
CREATE TABLE public.task_reminder_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  lead_minutes INTEGER[] NOT NULL DEFAULT ARRAY[1440, 60, 0]::INTEGER[],
  notify_overdue BOOLEAN NOT NULL DEFAULT true,
  overdue_repeat_minutes INTEGER NOT NULL DEFAULT 0,
  inapp_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_reminder_settings TO authenticated;
GRANT ALL ON public.task_reminder_settings TO service_role;
ALTER TABLE public.task_reminder_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own task reminder settings" ON public.task_reminder_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.task_reminder_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('lead', 'due', 'overdue')),
  offset_minutes INTEGER NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id, kind, offset_minutes, due_at)
);
CREATE INDEX task_reminder_log_task_idx ON public.task_reminder_log (task_id);
GRANT SELECT, INSERT, DELETE ON public.task_reminder_log TO authenticated;
GRANT ALL ON public.task_reminder_log TO service_role;
ALTER TABLE public.task_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own reminder log" ON public.task_reminder_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER update_task_reminder_settings_updated_at
  BEFORE UPDATE ON public.task_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
