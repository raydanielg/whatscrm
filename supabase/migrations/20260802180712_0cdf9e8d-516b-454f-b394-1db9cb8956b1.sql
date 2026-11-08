CREATE INDEX IF NOT EXISTS idx_security_events_type_created
  ON public.security_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_actor_created
  ON public.security_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_ws_type_created
  ON public.security_events (workspace_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_audit_trail(
  _workspace_id uuid,
  _since timestamptz DEFAULT (now() - interval '7 days'),
  _categories text[] DEFAULT ARRAY['auth','rls','rpc','db'],
  _limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  category text,
  event_type text,
  severity text,
  actor_id uuid,
  resource_type text,
  resource_id text,
  ip_address inet,
  user_agent text,
  data jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.created_at,
    split_part(e.event_type, '.', 1) AS category,
    e.event_type,
    e.severity,
    e.actor_id,
    e.resource_type,
    e.resource_id,
    e.ip_address,
    e.user_agent,
    e.data
  FROM public.security_events e
  WHERE e.workspace_id = _workspace_id
    AND public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[])
    AND e.created_at >= _since
    AND split_part(e.event_type, '.', 1) = ANY (_categories)
  ORDER BY e.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000)
$$;

REVOKE ALL ON FUNCTION public.get_audit_trail(uuid, timestamptz, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_trail(uuid, timestamptz, text[], integer) TO authenticated;