-- Campaigns and drip sequences create pending work, but the deployed cron
-- migrations never registered their dispatch endpoints. Register both jobs
-- through the existing Vault-backed helper so they call this deployment with
-- the x-cron-token header. Do not embed a URL or credential in cron.job.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-campaign-dispatch') THEN
    PERFORM cron.schedule(
      'wa-campaign-dispatch',
      '* * * * *',
      $job$SELECT public._wa_cron_post('/api/public/hooks/campaign-dispatch');$job$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-drip-tick') THEN
    PERFORM cron.schedule(
      'wa-drip-tick',
      '* * * * *',
      $job$SELECT public._wa_cron_post('/api/public/hooks/drip-tick');$job$
    );
  END IF;
END;
$migration$;
