CREATE TABLE IF NOT EXISTS public.whatsapp_auto_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.whatsapp_qr_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'contains' CHECK (trigger_type IN ('exact','contains','starts_with','regex','any','welcome','offline')),
  keywords text[] NOT NULL DEFAULT '{}',
  reply_type text NOT NULL DEFAULT 'text' CHECK (reply_type IN ('text','image','video','document','audio','location')),
  reply_text text,
  media_url text,
  media_caption text,
  enabled boolean NOT NULL DEFAULT true,
  match_case boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  cooldown_seconds integer NOT NULL DEFAULT 0,
  active_hours jsonb,
  hit_count integer NOT NULL DEFAULT 0,
  last_triggered_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_auto_replies_workspace ON public.whatsapp_auto_replies(workspace_id, enabled, priority);
CREATE INDEX IF NOT EXISTS idx_wa_auto_replies_session ON public.whatsapp_auto_replies(session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_auto_replies TO authenticated;
GRANT ALL ON public.whatsapp_auto_replies TO service_role;
ALTER TABLE public.whatsapp_auto_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_auto_replies_select" ON public.whatsapp_auto_replies FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_auto_replies.workspace_id AND wm.user_id = auth.uid())
  );
CREATE POLICY "wa_auto_replies_insert" ON public.whatsapp_auto_replies FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_auto_replies.workspace_id AND wm.user_id = auth.uid())
  );
CREATE POLICY "wa_auto_replies_update" ON public.whatsapp_auto_replies FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_auto_replies.workspace_id AND wm.user_id = auth.uid())
  );
CREATE POLICY "wa_auto_replies_delete" ON public.whatsapp_auto_replies FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_auto_replies.workspace_id AND wm.user_id = auth.uid())
  );
CREATE TRIGGER whatsapp_auto_replies_updated_at
  BEFORE UPDATE ON public.whatsapp_auto_replies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();