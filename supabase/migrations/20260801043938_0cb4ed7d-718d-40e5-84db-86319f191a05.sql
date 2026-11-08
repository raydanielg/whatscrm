CREATE OR REPLACE FUNCTION public.record_login_attempt(_user_id uuid, _event text, _ip inet DEFAULT NULL::inet, _user_agent text DEFAULT NULL::text, _device text DEFAULT NULL::text, _failure_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _caller uuid := auth.uid(); _target uuid;
BEGIN
  -- Signed-in callers may only record attempts for themselves. Trusted
  -- server-side callers (service_role / no JWT) may pass an explicit user.
  IF _caller IS NOT NULL THEN
    _target := _caller;
  ELSE
    _target := _user_id;
  END IF;
  IF _target IS NULL THEN
    RAISE EXCEPTION 'record_login_attempt: no target user';
  END IF;

  INSERT INTO public.login_history(user_id, event, ip_address, user_agent, device, failure_reason)
  VALUES (_target, _event, _ip, _user_agent, _device, _failure_reason)
  RETURNING id INTO _id;

  IF _event = 'failed' THEN
    INSERT INTO public.account_lockouts(user_id, failed_attempts, last_failed_at)
    VALUES (_target, 1, now())
    ON CONFLICT (user_id) DO UPDATE
      SET failed_attempts = public.account_lockouts.failed_attempts + 1,
          last_failed_at = now();
  ELSIF _event = 'success' THEN
    UPDATE public.account_lockouts SET failed_attempts = 0, locked_until = NULL WHERE user_id = _target;
  END IF;
  RETURN _id;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_security_event(_workspace_id uuid, _event_type text, _severity text DEFAULT 'info'::text, _resource_type text DEFAULT NULL::text, _resource_id text DEFAULT NULL::text, _data jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _caller uuid := auth.uid();
BEGIN
  -- Signed-in callers may only log events into workspaces they belong to.
  IF _caller IS NOT NULL AND _workspace_id IS NOT NULL
     AND NOT public.is_workspace_member(_workspace_id, _caller) THEN
    RAISE EXCEPTION 'log_security_event: not a member of workspace %', _workspace_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.security_events(workspace_id, actor_id, severity, event_type, resource_type, resource_id, data)
  VALUES (_workspace_id, _caller, _severity, _event_type, _resource_type, _resource_id, COALESCE(_data,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $function$;