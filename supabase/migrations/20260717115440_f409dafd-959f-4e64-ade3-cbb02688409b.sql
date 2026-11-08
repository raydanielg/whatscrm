-- ============================================================================
-- message_templates: saved replies / canned responses / slash-command templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  shortcut TEXT,                    -- e.g. "hello" -> "/hello"
  body TEXT NOT NULL,
  category TEXT,
  language TEXT DEFAULT 'en',
  is_shared BOOLEAN NOT NULL DEFAULT true,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_templates_ws_idx ON public.message_templates(workspace_id);
CREATE INDEX IF NOT EXISTS message_templates_shortcut_idx ON public.message_templates(workspace_id, shortcut) WHERE shortcut IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_templates_favorite_idx ON public.message_templates(workspace_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS message_templates_name_trgm ON public.message_templates USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS message_templates_body_trgm ON public.message_templates USING gin (body gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view shared or own templates"
  ON public.message_templates FOR SELECT
  TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (is_shared OR created_by = auth.uid())
  );

CREATE POLICY "Members can create templates"
  ON public.message_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Authors or admins can update templates"
  ON public.message_templates FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

CREATE POLICY "Authors or admins can delete templates"
  ON public.message_templates FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

CREATE TRIGGER message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================================
-- message_drafts: per-user autosaved drafts per conversation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.message_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_drafts_user_idx ON public.message_drafts(user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_drafts TO authenticated;
GRANT ALL ON public.message_drafts TO service_role;

ALTER TABLE public.message_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own drafts"
  ON public.message_drafts FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER message_drafts_updated_at
  BEFORE UPDATE ON public.message_drafts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================================
-- scheduled_messages: send-later queue
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.scheduled_message_status AS ENUM ('pending','sent','cancelled','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status public.scheduled_message_status NOT NULL DEFAULT 'pending',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  sent_message_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_messages_ws_idx ON public.scheduled_messages(workspace_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS scheduled_messages_conv_idx ON public.scheduled_messages(conversation_id, scheduled_for);
CREATE INDEX IF NOT EXISTS scheduled_messages_pending_idx ON public.scheduled_messages(scheduled_for) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;
GRANT ALL ON public.scheduled_messages TO service_role;

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view scheduled messages"
  ON public.scheduled_messages FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members create their own scheduled messages"
  ON public.scheduled_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Authors or admins update scheduled messages"
  ON public.scheduled_messages FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

CREATE POLICY "Authors or admins delete scheduled messages"
  ON public.scheduled_messages FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

CREATE TRIGGER scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages;