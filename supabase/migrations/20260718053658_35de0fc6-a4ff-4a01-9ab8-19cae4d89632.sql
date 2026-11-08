
DO $$
DECLARE
  anon_key text := 'sb_publishable_vIQQo4PPa-PbG3Zs-kz5vw_bdCne7Sh';
  endpoint text := 'https://project--206182b2-0a34-4382-9e54-92466a9ffea8.lovable.app/api/public/hooks/billing/rollup';
BEGIN
  -- unschedule previous version if it exists (ignore errors)
  PERFORM cron.unschedule('billing-daily-revenue-rollup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-daily-revenue-rollup');

  PERFORM cron.schedule(
    'billing-daily-revenue-rollup',
    '15 0 * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','apikey', %L),
        body := '{}'::jsonb
      );
    $f$, endpoint, anon_key)
  );
END $$;
