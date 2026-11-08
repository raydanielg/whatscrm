-- Real platform health numbers for Super Admin -> Monitoring and the Overview page.
--
-- `getMonitoringSnapshotInternal` used to be a stub that returned only the
-- realtime block, so /admin/monitoring crashed on `snapshot.queues.workflow`
-- being undefined and the Overview page showed hard-coded "system signals".
-- This function measures the platform in one round trip.
--
-- Read-only. SECURITY DEFINER because it reads across every tenant and reads
-- pg_stat_activity; that is why EXECUTE is limited to service_role. The server
-- function that calls it asserts platform staff first.

CREATE OR REPLACE FUNCTION public.platform_monitoring_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'db_size_bytes',      pg_database_size(current_database()),
    'db_connections',     (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
    'db_max_connections', current_setting('max_connections')::int,

    'storage_bytes',      COALESCE((SELECT sum(size_bytes) FROM public.files), 0),
    'storage_files',      (SELECT count(*) FROM public.files),

    'queues', jsonb_build_object(
      'workflow', (
        SELECT jsonb_build_object(
          'pending', count(*) FILTER (WHERE status IN ('pending', 'queued', 'scheduled')),
          'running', count(*) FILTER (WHERE status IN ('running', 'processing', 'leased')),
          'failed',  count(*) FILTER (WHERE status IN ('failed', 'dead', 'dead_letter', 'dead_lettered')
                                         OR dead_lettered_at IS NOT NULL))
        FROM public.workflow_queue),
      'campaigns', (
        SELECT jsonb_build_object(
          'pending', count(*) FILTER (WHERE status IN ('pending', 'queued', 'scheduled')),
          'running', count(*) FILTER (WHERE status IN ('running', 'processing', 'sending')),
          'failed',  count(*) FILTER (WHERE status IN ('failed', 'dead', 'dead_letter')))
        FROM public.campaign_dispatch_queue),
      'outbox', (
        SELECT jsonb_build_object(
          'pending', count(*) FILTER (WHERE status IN ('queued', 'processing')),
          'failed',  count(*) FILTER (WHERE status IN ('failed', 'dead_letter')))
        FROM public.message_outbox),
      'webhooks', (
        SELECT jsonb_build_object(
          'pending', count(*) FILTER (WHERE NOT processed AND dead_letter_at IS NULL AND last_error IS NULL),
          'failed',  count(*) FILTER (WHERE NOT processed AND (dead_letter_at IS NOT NULL OR last_error IS NOT NULL)))
        FROM public.webhook_events)
    ),

    'api', (
      SELECT jsonb_build_object(
        'requests', count(*),
        'errors',   count(*) FILTER (WHERE status_code >= 500),
        'avg_ms',   round(avg(latency_ms)),
        'p95_ms',   round((percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric))
      FROM public.api_gateway_logs
      WHERE created_at >= now() - interval '5 minutes')
  );
$$;

REVOKE ALL ON FUNCTION public.platform_monitoring_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_monitoring_stats() TO service_role;
