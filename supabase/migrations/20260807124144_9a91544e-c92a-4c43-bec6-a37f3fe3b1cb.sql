-- 1) Billing PII: restrict SELECT to owner/admin/billing
DROP POLICY IF EXISTS "Members view billing customers" ON public.billing_customers;
CREATE POLICY "Billing roles view billing customers"
ON public.billing_customers
FOR SELECT
TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'billing'::org_role]));

-- 2) Widget realtime topic bound to the visitor's secret external_id
CREATE OR REPLACE FUNCTION public.widget_topic_allowed(_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _topic LIKE 'widget:%:%'
     AND EXISTS (
       SELECT 1 FROM public.chatbot_sessions s
       WHERE s.id::text = split_part(_topic, ':', 2)
         AND s.external_id IS NOT NULL
         AND s.external_id = split_part(_topic, ':', 3)
     );
$$;

CREATE OR REPLACE FUNCTION public.widget_broadcast(_session_id uuid, _kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ext text;
BEGIN
  IF _session_id IS NULL THEN RETURN; END IF;
  SELECT external_id INTO _ext FROM public.chatbot_sessions WHERE id = _session_id;
  IF _ext IS NULL THEN RETURN; END IF;
  PERFORM realtime.send(
    jsonb_build_object('kind', _kind, 'session_id', _session_id, 'at', now()),
    'widget_update',
    'widget:' || _session_id::text || ':' || _ext,
    true
  );
END;
$$;

-- 3) Remove broad anon grants on WhatsApp QR sessions (credential ciphertext)
REVOKE ALL ON public.whatsapp_qr_sessions FROM anon;

-- 4) Push dispatch trigger must authenticate itself
CREATE OR REPLACE FUNCTION public.dispatch_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  endpoint text := 'https://project--206182b2-0a34-4382-9e54-92466a9ffea8.lovable.app/api/public/push-dispatch';
  cron_token text := '3b458e0c03856e1ec5db7698d05a90bcedbbfafe70ab27797141bf8ce1560b59';
begin
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token', cron_token),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;