CREATE OR REPLACE FUNCTION public._wa_cron_post(_path text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $fn$
DECLARE
  _base text := 'https://project--206182b2-0a34-4382-9e54-92466a9ffea8.lovable.app';
  _token text := 'a9f604eda39c156079fef8165723e2fa0383acf1b77d3c2184708d6e926be27b';
  _req bigint;
BEGIN
  SELECT net.http_post(
    url := _base || _path,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token',_token),
    body := _body,
    timeout_milliseconds := 55000
  ) INTO _req;
  RETURN _req;
END;
$fn$;