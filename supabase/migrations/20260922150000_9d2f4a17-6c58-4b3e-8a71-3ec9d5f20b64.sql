-- Security hardening of RPC-exposed SECURITY DEFINER functions.
-- Found by the Supabase database linter (0028/0029) on 2026-09-22.

-- 1) prune_gateway_webhook_deliveries() — REAL vulnerability.
--    SECURITY DEFINER, no authorization check of any kind, and EXECUTE was
--    granted to anon. Any unauthenticated caller could POST to
--    /rest/v1/rpc/prune_gateway_webhook_deliveries and destroy payment gateway
--    webhook delivery history (everything older than 30 days).
--    It is a maintenance job: restrict it to service_role, and defend in depth
--    with an explicit guard so it cannot be abused if ever re-granted.
CREATE OR REPLACE FUNCTION public.prune_gateway_webhook_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  -- Only the service role (server-side jobs) or a platform super admin may
  -- prune.
  --
  -- An earlier version tested `auth.uid() IS NOT NULL AND NOT is_super_admin(...)`,
  -- which did NOT block anon — auth.uid() is NULL for an anonymous caller just
  -- as it is for service_role, so the guard let through the exact actor it was
  -- written to stop. Only the accompanying REVOKE was doing any work, and a
  -- future GRANT would have silently reopened it. Test the role explicitly.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT COALESCE(public.is_super_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.payment_gateway_webhook_deliveries
  WHERE received_at < now() - interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_gateway_webhook_deliveries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_gateway_webhook_deliveries() TO service_role;

-- 2) channel_account_secrets() — defence in depth.
--    Returns verify tokens and secret *names* for a workspace's channel
--    accounts. Its own WHERE clause requires has_workspace_role(..., auth.uid(),
--    owner/admin), so anon (auth.uid() IS NULL) already gets zero rows — this
--    was not leaking. But a function of this name has no business being
--    reachable unauthenticated, and the guard is one edit away from being the
--    only thing standing between anon and channel credentials.
REVOKE ALL ON FUNCTION public.channel_account_secrets(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_account_secrets(uuid, uuid) TO authenticated, service_role;

-- 3) Trigger functions should never be RPC-callable. They are listed by the
--    linter because EXECUTE is granted broadly; invoking one outside a trigger
--    errors, but exposing them on the REST surface is pointless noise and an
--    unnecessary attack surface.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.tg_consume_workspace_invitation()',
    'public.tg_vcard_views_rate_limit()',
    'public.tg_widget_chatbot_message()',
    'public.tg_widget_conversation_status()',
    'public.tg_widget_inbox_message()',
    'public.tg_widget_session_status()',
    'public.tg_widget_typing()'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END $$;
