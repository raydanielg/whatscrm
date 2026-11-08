
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public._wa_cron_post(_path text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base text := 'https://project--206182b2-0a34-4382-9e54-92466a9ffea8.lovable.app';
  _apikey text := 'sb_publishable_vIQQo4PPa-PbG3Zs-kz5vw_bdCne7Sh';
  _req bigint;
BEGIN
  SELECT net.http_post(
    url := _base || _path,
    headers := jsonb_build_object('Content-Type','application/json','apikey',_apikey),
    body := _body,
    timeout_milliseconds := 55000
  ) INTO _req;
  RETURN _req;
END;
$$;

DO $$
DECLARE _j text;
BEGIN
  FOR _j IN SELECT jobname FROM cron.job WHERE jobname IN (
    'wa-process-outbox','wa-process-webhooks','wa-process-scheduled',
    'wa-flush-scheduled-messages','wa-run-scheduled-syncs','wa-cleanup-media'
  ) LOOP
    PERFORM cron.unschedule(_j);
  END LOOP;
END $$;

SELECT cron.schedule('wa-process-outbox','* * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/process-outbox'); $q$);
SELECT cron.schedule('wa-process-webhooks','* * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/process-webhooks'); $q$);
SELECT cron.schedule('wa-process-scheduled','* * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/process-scheduled'); $q$);
SELECT cron.schedule('wa-flush-scheduled-messages','* * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/flush-scheduled-messages'); $q$);
SELECT cron.schedule('wa-run-scheduled-syncs','*/5 * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/run-scheduled-syncs'); $q$);
SELECT cron.schedule('wa-cleanup-media','17 * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/cleanup-media'); $q$);
