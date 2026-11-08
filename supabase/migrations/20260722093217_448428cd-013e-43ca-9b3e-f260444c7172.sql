-- Settings per workspace
CREATE TABLE public.birthday_reminder_settings (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  lead_days INT[] NOT NULL DEFAULT '{7,1,0}',
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  inapp_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.birthday_reminder_settings TO authenticated;
GRANT ALL ON public.birthday_reminder_settings TO service_role;

ALTER TABLE public.birthday_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view birthday settings"
  ON public.birthday_reminder_settings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = birthday_reminder_settings.workspace_id
      AND wm.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage birthday settings"
  ON public.birthday_reminder_settings FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = birthday_reminder_settings.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = birthday_reminder_settings.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','admin')
  ));

CREATE TRIGGER trg_birthday_reminder_settings_updated
  BEFORE UPDATE ON public.birthday_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Log to keep the job idempotent
CREATE TABLE public.birthday_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  owner_id UUID,
  reminder_date DATE NOT NULL,
  lead_offset_days INT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('inapp','email')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, reminder_date, lead_offset_days, channel)
);

CREATE INDEX idx_birthday_reminder_log_workspace ON public.birthday_reminder_log(workspace_id, reminder_date DESC);

GRANT SELECT ON public.birthday_reminder_log TO authenticated;
GRANT ALL ON public.birthday_reminder_log TO service_role;

ALTER TABLE public.birthday_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view birthday log"
  ON public.birthday_reminder_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = birthday_reminder_log.workspace_id
      AND wm.user_id = auth.uid()
  ));