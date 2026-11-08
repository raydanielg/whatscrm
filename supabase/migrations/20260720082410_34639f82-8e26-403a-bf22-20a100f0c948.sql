CREATE TABLE IF NOT EXISTS public.whatsapp_warmer_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  daily_target int NOT NULL DEFAULT 30,
  min_delay_seconds int NOT NULL DEFAULT 45,
  max_delay_seconds int NOT NULL DEFAULT 240,
  active_from time NOT NULL DEFAULT '09:00',
  active_to time NOT NULL DEFAULT '21:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_warmer_settings TO authenticated;
GRANT ALL ON public.whatsapp_warmer_settings TO service_role;
ALTER TABLE public.whatsapp_warmer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warmer_settings_all" ON public.whatsapp_warmer_settings
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_whatsapp_warmer_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_warmer_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.whatsapp_warmer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warmer_messages_workspace ON public.whatsapp_warmer_messages(workspace_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_warmer_messages TO authenticated;
GRANT ALL ON public.whatsapp_warmer_messages TO service_role;
ALTER TABLE public.whatsapp_warmer_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warmer_messages_all" ON public.whatsapp_warmer_messages
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_whatsapp_warmer_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_warmer_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();