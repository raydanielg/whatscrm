
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with the same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('sla-breach-scanner');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sla-breach-scanner',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--206182b2-0a34-4382-9e54-92466a9ffea8.lovable.app/api/public/hooks/sla-scan',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_vIQQo4PPa-PbG3Zs-kz5vw_bdCne7Sh"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
