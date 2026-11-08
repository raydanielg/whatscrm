CREATE OR REPLACE FUNCTION public.prune_gateway_webhook_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  DELETE FROM public.payment_gateway_webhook_deliveries
  WHERE received_at < now() - interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_gateway_webhook_deliveries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_gateway_webhook_deliveries() TO service_role;

REVOKE ALL ON FUNCTION public.channel_account_secrets(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_account_secrets(uuid, uuid) TO authenticated, service_role;

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
