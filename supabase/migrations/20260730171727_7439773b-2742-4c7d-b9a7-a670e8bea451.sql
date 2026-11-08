CREATE TABLE IF NOT EXISTS public.wa_handoff_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  strategy text NOT NULL DEFAULT 'round_robin',
  required_skills text[] NOT NULL DEFAULT '{}',
  match_language boolean NOT NULL DEFAULT true,
  respect_max_concurrent boolean NOT NULL DEFAULT true,
  agent_cooldown_seconds integer NOT NULL DEFAULT 60,
  conversation_cooldown_seconds integer NOT NULL DEFAULT 300,
  pause_bot_on_handoff boolean NOT NULL DEFAULT true,
  queue_when_unavailable boolean NOT NULL DEFAULT true,
  notify_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_handoff_strategy_chk CHECK (strategy IN ('round_robin','least_busy','skill','auto')),
  CONSTRAINT wa_handoff_agent_cooldown_chk CHECK (agent_cooldown_seconds BETWEEN 0 AND 86400),
  CONSTRAINT wa_handoff_conv_cooldown_chk CHECK (conversation_cooldown_seconds BETWEEN 0 AND 86400)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_handoff_settings TO authenticated;
GRANT ALL ON public.wa_handoff_settings TO service_role;

ALTER TABLE public.wa_handoff_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_handoff_settings_select" ON public.wa_handoff_settings
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "wa_handoff_settings_insert" ON public.wa_handoff_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "wa_handoff_settings_update" ON public.wa_handoff_settings
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "wa_handoff_settings_delete" ON public.wa_handoff_settings
  FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER wa_handoff_settings_touch
  BEFORE UPDATE ON public.wa_handoff_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();