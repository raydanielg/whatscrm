-- Topic-scoped authorization helper for Supabase Realtime channels.
CREATE OR REPLACE FUNCTION public.realtime_topic_allowed(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _match text;
  _id uuid;
BEGIN
  IF _uid IS NULL OR _topic IS NULL OR btrim(_topic) = '' THEN
    RETURN false;
  END IF;

  IF public.is_super_admin(_uid) THEN
    RETURN true;
  END IF;

  -- Every tenant-scoped topic embeds the workspace / organization /
  -- conversation UUID (e.g. "ws-presence:<uuid>", "typing:<uuid>",
  -- "workspace:<uuid>:inbox", "org-status:<uuid>").
  _match := substring(_topic from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}');
  IF _match IS NULL THEN
    RETURN false;
  END IF;
  _id := _match::uuid;

  IF public.is_workspace_member(_id, _uid) THEN
    RETURN true;
  END IF;

  IF public.is_org_member(_id, _uid) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _id
      AND public.is_workspace_member(c.workspace_id, _uid)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.realtime_topic_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.realtime_topic_allowed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.realtime_topic_allowed(text) TO service_role;

-- Topic-scoped RLS on the realtime broadcast/presence stream.
DROP POLICY IF EXISTS "realtime messages: tenant members read" ON realtime.messages;
DROP POLICY IF EXISTS "realtime messages: tenant members write" ON realtime.messages;

CREATE POLICY "realtime messages: tenant members read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.realtime_topic_allowed((SELECT realtime.topic())));

CREATE POLICY "realtime messages: tenant members write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (public.realtime_topic_allowed((SELECT realtime.topic())));