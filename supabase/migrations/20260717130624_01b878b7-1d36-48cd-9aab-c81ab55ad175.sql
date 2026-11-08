
ALTER TABLE public.personal_access_tokens
  ADD COLUMN IF NOT EXISTS ip_allowlist inet[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer,
  ADD COLUMN IF NOT EXISTS rotated_from uuid REFERENCES public.personal_access_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rotated_at timestamptz,
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pat_workspace ON public.personal_access_tokens(workspace_id);

CREATE TABLE IF NOT EXISTS public.ip_allowlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  cidr cidr NOT NULL,
  applies_to text NOT NULL DEFAULT 'api' CHECK (applies_to IN ('api','ui','all')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_allowlist_ws ON public.ip_allowlists(workspace_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_allowlists TO authenticated;
GRANT ALL ON public.ip_allowlists TO service_role;
ALTER TABLE public.ip_allowlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws admins manage ip allowlist" ON public.ip_allowlists
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE POLICY "ws members read ip allowlist" ON public.ip_allowlists
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER ip_allowlist_updated BEFORE UPDATE ON public.ip_allowlists
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.data_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (resource IN (
    'messages','conversations','media','audit_logs','webhook_events',
    'login_history','activities','notifications','error_logs'
  )),
  retention_days integer NOT NULL CHECK (retention_days > 0 AND retention_days <= 3650),
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_deleted_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, resource)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_retention_policies TO authenticated;
GRANT ALL ON public.data_retention_policies TO service_role;
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws admins manage retention" ON public.data_retention_policies
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE POLICY "ws members read retention" ON public.data_retention_policies
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER retention_updated BEFORE UPDATE ON public.data_retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.gdpr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('contact','user')),
  subject_id uuid NOT NULL,
  subject_identifier text,
  request_type text NOT NULL CHECK (request_type IN ('export','erasure','restriction','rectification','portability')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected','failed')),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  completed_at timestamptz,
  export_url text,
  export_expires_at timestamptz,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gdpr_ws ON public.gdpr_requests(workspace_id, status, requested_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gdpr_requests TO authenticated;
GRANT ALL ON public.gdpr_requests TO service_role;
ALTER TABLE public.gdpr_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws admins manage gdpr" ON public.gdpr_requests
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE TRIGGER gdpr_updated BEFORE UPDATE ON public.gdpr_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  window_seconds integer NOT NULL,
  count integer NOT NULL DEFAULT 0,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup ON public.rate_limit_buckets(bucket_key, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_cleanup ON public.rate_limit_buckets(window_start);
GRANT SELECT, INSERT, UPDATE ON public.rate_limit_buckets TO authenticated;
GRANT ALL ON public.rate_limit_buckets TO service_role;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service manages rate limits" ON public.rate_limit_buckets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enforce_rate_limit(
  _bucket_key text,
  _limit integer,
  _window_seconds integer DEFAULT 60,
  _workspace_id uuid DEFAULT NULL
) RETURNS TABLE(allowed boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  _win timestamptz := to_timestamp((extract(epoch from now())::bigint / _window_seconds) * _window_seconds);
  _row public.rate_limit_buckets%ROWTYPE;
BEGIN
  INSERT INTO public.rate_limit_buckets(bucket_key, window_start, window_seconds, count, workspace_id)
  VALUES (_bucket_key, _win, _window_seconds, 1, _workspace_id)
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET count = public.rate_limit_buckets.count + 1
  RETURNING * INTO _row;

  allowed := _row.count <= _limit;
  remaining := GREATEST(0, _limit - _row.count);
  reset_at := _row.window_start + make_interval(secs => _window_seconds);
  RETURN NEXT;
END $fn$;
GRANT EXECUTE ON FUNCTION public.enforce_rate_limit(text,integer,integer,uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.webhook_signing_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_account_id uuid REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  secret_prefix text NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  activated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signing_ws ON public.webhook_signing_secrets(workspace_id, is_primary);
GRANT SELECT, INSERT, UPDATE ON public.webhook_signing_secrets TO authenticated;
GRANT ALL ON public.webhook_signing_secrets TO service_role;
ALTER TABLE public.webhook_signing_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws admins manage signing secrets" ON public.webhook_signing_secrets
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  event_type text NOT NULL,
  ip_address inet,
  user_agent text,
  resource_type text,
  resource_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_ws ON public.security_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events(severity, created_at DESC);
GRANT SELECT, INSERT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws admins read security events" ON public.security_events
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE POLICY "auth insert security events" ON public.security_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

CREATE OR REPLACE FUNCTION public.log_security_event(
  _workspace_id uuid,
  _event_type text,
  _severity text DEFAULT 'info',
  _resource_type text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.security_events(workspace_id, actor_id, severity, event_type, resource_type, resource_id, data)
  VALUES (_workspace_id, auth.uid(), _severity, _event_type, _resource_type, _resource_id, COALESCE(_data,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.log_security_event(uuid,text,text,text,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_retention_policies()
RETURNS TABLE(policy_id uuid, resource text, deleted bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE _p public.data_retention_policies%ROWTYPE; _n bigint;
BEGIN
  FOR _p IN SELECT * FROM public.data_retention_policies WHERE is_active LOOP
    _n := 0;
    IF _p.resource = 'messages' THEN
      DELETE FROM public.messages m USING public.conversations c
       WHERE m.conversation_id = c.id
         AND c.workspace_id = _p.workspace_id
         AND m.created_at < now() - make_interval(days => _p.retention_days);
      GET DIAGNOSTICS _n = ROW_COUNT;
    ELSIF _p.resource = 'audit_logs' THEN
      DELETE FROM public.audit_logs WHERE workspace_id = _p.workspace_id
         AND created_at < now() - make_interval(days => _p.retention_days);
      GET DIAGNOSTICS _n = ROW_COUNT;
    ELSIF _p.resource = 'webhook_events' THEN
      DELETE FROM public.webhook_events WHERE workspace_id = _p.workspace_id
         AND created_at < now() - make_interval(days => _p.retention_days);
      GET DIAGNOSTICS _n = ROW_COUNT;
    ELSIF _p.resource = 'login_history' THEN
      DELETE FROM public.login_history l USING public.workspace_members wm
       WHERE wm.user_id = l.user_id AND wm.workspace_id = _p.workspace_id
         AND l.created_at < now() - make_interval(days => _p.retention_days);
      GET DIAGNOSTICS _n = ROW_COUNT;
    ELSIF _p.resource = 'notifications' THEN
      DELETE FROM public.notifications WHERE workspace_id = _p.workspace_id
         AND created_at < now() - make_interval(days => _p.retention_days);
      GET DIAGNOSTICS _n = ROW_COUNT;
    ELSIF _p.resource = 'media' THEN
      UPDATE public.message_attachments SET is_deleted = true, expires_at = now()
       WHERE workspace_id = _p.workspace_id
         AND created_at < now() - make_interval(days => _p.retention_days)
         AND is_deleted = false;
      GET DIAGNOSTICS _n = ROW_COUNT;
    END IF;

    UPDATE public.data_retention_policies
      SET last_run_at = now(), last_deleted_count = _n, updated_at = now()
      WHERE id = _p.id;

    policy_id := _p.id; resource := _p.resource; deleted := _n;
    RETURN NEXT;
  END LOOP;
END $fn$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE _n bigint;
BEGIN
  DELETE FROM public.rate_limit_buckets WHERE window_start < now() - interval '24 hours';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
