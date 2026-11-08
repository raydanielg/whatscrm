
-- Label metadata
ALTER TABLE public.conversation_labels
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Saved filters
CREATE TABLE public.saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  color text,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal','shared')),
  is_pinned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_filters TO authenticated;
GRANT ALL ON public.saved_filters TO service_role;
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_filters read" ON public.saved_filters FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid())
         AND (scope = 'shared' OR owner_id = auth.uid()));
CREATE POLICY "saved_filters personal write" ON public.saved_filters FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND scope = 'personal')
  WITH CHECK (owner_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "saved_filters shared admin" ON public.saved_filters FOR ALL TO authenticated
  USING (scope = 'shared' AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (scope = 'shared' AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE INDEX idx_saved_filters_ws ON public.saved_filters(workspace_id, sort_order);
CREATE INDEX idx_saved_filters_owner ON public.saved_filters(owner_id) WHERE owner_id IS NOT NULL;
CREATE TRIGGER trg_saved_filters_updated BEFORE UPDATE ON public.saved_filters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Search helper indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_messages_body_trgm ON public.messages USING gin (body public.gin_trgm_ops) WHERE body IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING gin (display_name public.gin_trgm_ops) WHERE display_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm ON public.contacts USING gin (phone public.gin_trgm_ops) WHERE phone IS NOT NULL;

-- Advanced search RPC
CREATE OR REPLACE FUNCTION public.search_inbox(
  _workspace_id uuid,
  _q text,
  _kinds text[] DEFAULT ARRAY['conversation','message','contact','attachment'],
  _limit integer DEFAULT 25
)
RETURNS TABLE (
  kind text,
  id uuid,
  conversation_id uuid,
  title text,
  snippet text,
  score real,
  created_at timestamptz,
  meta jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _q IS NULL OR length(trim(_q)) = 0 THEN RETURN; END IF;

  RETURN QUERY
  (
    SELECT 'contact'::text, c.id, NULL::uuid,
      c.display_name, coalesce(c.email, c.phone, ''),
      GREATEST(
        public.similarity(coalesce(c.display_name,''), _q),
        public.similarity(coalesce(c.email,''), _q),
        public.similarity(coalesce(c.phone,''), _q)
      )::real,
      c.created_at,
      jsonb_build_object('email', c.email, 'phone', c.phone, 'avatar_url', c.avatar_url)
    FROM public.contacts c
    WHERE c.workspace_id = _workspace_id
      AND 'contact' = ANY(_kinds)
      AND (
        c.display_name ILIKE '%' || _q || '%'
        OR c.email ILIKE '%' || _q || '%'
        OR c.phone ILIKE '%' || _q || '%'
      )
    ORDER BY 6 DESC
    LIMIT _limit
  )
  UNION ALL
  (
    SELECT 'conversation'::text, conv.id, conv.id,
      coalesce(conv.subject, ct.display_name, 'Conversation'),
      coalesce(conv.last_message_preview, ''),
      public.similarity(coalesce(conv.subject,'') || ' ' || coalesce(conv.last_message_preview,''), _q)::real,
      conv.created_at,
      jsonb_build_object('status', conv.status, 'priority', conv.priority, 'contact_id', conv.contact_id, 'inbox_id', conv.inbox_id)
    FROM public.conversations conv
    LEFT JOIN public.contacts ct ON ct.id = conv.contact_id
    WHERE conv.workspace_id = _workspace_id
      AND conv.deleted_at IS NULL
      AND 'conversation' = ANY(_kinds)
      AND (
        conv.subject ILIKE '%' || _q || '%'
        OR conv.last_message_preview ILIKE '%' || _q || '%'
      )
    ORDER BY 6 DESC
    LIMIT _limit
  )
  UNION ALL
  (
    SELECT 'message'::text, m.id, m.conversation_id,
      left(coalesce(m.body,''), 80),
      coalesce(m.body,''),
      public.similarity(coalesce(m.body,''), _q)::real,
      m.created_at,
      jsonb_build_object('direction', m.direction, 'message_type', m.message_type)
    FROM public.messages m
    JOIN public.conversations conv ON conv.id = m.conversation_id
    WHERE conv.workspace_id = _workspace_id
      AND 'message' = ANY(_kinds)
      AND m.body ILIKE '%' || _q || '%'
    ORDER BY 6 DESC
    LIMIT _limit
  )
  UNION ALL
  (
    SELECT 'attachment'::text, ma.id, m.conversation_id,
      coalesce(ma.file_name, 'Attachment'),
      coalesce(ma.mime_type, ''),
      public.similarity(coalesce(ma.file_name,''), _q)::real,
      ma.created_at,
      jsonb_build_object('mime_type', ma.mime_type, 'size', ma.file_size, 'url', ma.file_url)
    FROM public.message_attachments ma
    JOIN public.messages m ON m.id = ma.message_id
    JOIN public.conversations conv ON conv.id = m.conversation_id
    WHERE conv.workspace_id = _workspace_id
      AND 'attachment' = ANY(_kinds)
      AND ma.file_name ILIKE '%' || _q || '%'
    ORDER BY 6 DESC
    LIMIT _limit
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.search_inbox(uuid, text, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_inbox(uuid, text, text[], integer) TO authenticated;

-- Bulk archive/delete/assign RPCs (rely on RLS via workspace membership)
CREATE OR REPLACE FUNCTION public.bulk_update_conversations(
  _ids uuid[],
  _patch jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ws uuid; _n integer := 0;
BEGIN
  SELECT workspace_id INTO _ws FROM public.conversations WHERE id = _ids[1];
  IF _ws IS NULL THEN RETURN 0; END IF;
  IF NOT public.is_workspace_member(_ws, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  UPDATE public.conversations c
    SET
      status = COALESCE((_patch->>'status')::conversation_status, c.status),
      priority = COALESCE((_patch->>'priority')::conversation_priority, c.priority),
      assigned_to = CASE WHEN _patch ? 'assigned_to' THEN NULLIF(_patch->>'assigned_to','')::uuid ELSE c.assigned_to END,
      is_archived = COALESCE((_patch->>'is_archived')::boolean, c.is_archived),
      deleted_at = CASE WHEN (_patch->>'delete')::boolean THEN now() ELSE c.deleted_at END,
      updated_at = now()
    WHERE c.id = ANY(_ids) AND c.workspace_id = _ws;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE EXECUTE ON FUNCTION public.bulk_update_conversations(uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_conversations(uuid[], jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.bulk_tag_conversations(
  _ids uuid[],
  _label_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ws uuid; _n integer := 0;
BEGIN
  SELECT workspace_id INTO _ws FROM public.conversations WHERE id = _ids[1];
  IF _ws IS NULL THEN RETURN 0; END IF;
  IF NOT public.is_workspace_member(_ws, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  INSERT INTO public.conversation_label_assignments(conversation_id, label_id, workspace_id, assigned_by)
  SELECT c, l, _ws, auth.uid()
    FROM unnest(_ids) c CROSS JOIN unnest(_label_ids) l
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE EXECUTE ON FUNCTION public.bulk_tag_conversations(uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_tag_conversations(uuid[], uuid[]) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_filters;
