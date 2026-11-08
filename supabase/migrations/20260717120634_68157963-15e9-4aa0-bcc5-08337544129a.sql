
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
      jsonb_build_object('mime_type', ma.mime_type, 'size', ma.size_bytes, 'url', ma.url)
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
