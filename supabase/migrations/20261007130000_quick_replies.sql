-- ============================================================================
-- quick_replies: canned/saved responses insertable into the Inbox composer
-- (distinct from message_templates: lighter-weight, agent-authored shortcuts
-- surfaced from the composer's "..." menu rather than the template picker)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  shortcut TEXT,                    -- e.g. "thanks" -> "/thanks"
  category TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quick_replies_ws_idx ON public.quick_replies(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quick_replies_usage_idx ON public.quick_replies(workspace_id, usage_count DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quick_replies_shortcut_uq
  ON public.quick_replies(workspace_id, lower(shortcut))
  WHERE shortcut IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quick_replies_title_trgm ON public.quick_replies USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS quick_replies_body_trgm ON public.quick_replies USING gin (body extensions.gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
GRANT ALL ON public.quick_replies TO service_role;

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view quick replies" ON public.quick_replies;
CREATE POLICY "Members can view quick replies"
  ON public.quick_replies FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create quick replies" ON public.quick_replies;
CREATE POLICY "Members can create quick replies"
  ON public.quick_replies FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Authors or admins can update quick replies" ON public.quick_replies;
CREATE POLICY "Authors or admins can update quick replies"
  ON public.quick_replies FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

DROP POLICY IF EXISTS "Authors or admins can delete quick replies" ON public.quick_replies;
CREATE POLICY "Authors or admins can delete quick replies"
  ON public.quick_replies FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

DROP TRIGGER IF EXISTS quick_replies_updated_at ON public.quick_replies;
CREATE TRIGGER quick_replies_updated_at
  BEFORE UPDATE ON public.quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'quick_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_replies;
  END IF;
END $$;
