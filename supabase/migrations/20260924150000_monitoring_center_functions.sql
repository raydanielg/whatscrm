-- Real data for Super Admin -> Monitoring Center (/monitoring-center).
--
-- That page used to render a fully synthetic snapshot: hard-coded health cards,
-- invented errors ("TypeError ... reading 'id'"), Math.random() traces, fake log
-- lines and fake alert rules. These two functions measure the platform instead.
--
-- Both are read-only, SECURITY DEFINER (they read across every tenant and read
-- pg_stat_*), and callable only by service_role. The server function that calls
-- them asserts platform staff first.

-- ---------------------------------------------------------------------------
-- 1) Metrics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_monitoring_center()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  api5 AS (
    SELECT count(*) AS req,
           count(*) FILTER (WHERE status_code >= 500) AS err,
           percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
           percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99
    FROM public.api_gateway_logs
    WHERE created_at >= now() - interval '5 minutes'),
  api24 AS (
    SELECT count(*) AS req,
           count(*) FILTER (WHERE status_code >= 500) AS err,
           avg(latency_ms) AS avg_ms,
           max(created_at) AS last_at
    FROM public.api_gateway_logs
    WHERE created_at >= now() - interval '24 hours'),
  wh AS (
    SELECT count(*) AS received,
           count(*) FILTER (WHERE status IN ('processed', 'ignored')) AS processed,
           count(*) FILTER (WHERE status = 'failed') AS failed,
           count(*) FILTER (WHERE status = 'rejected') AS rejected,
           count(*) FILTER (WHERE status = 'received'
                              AND received_at < now() - interval '10 minutes') AS stuck,
           avg(EXTRACT(epoch FROM (processed_at - received_at)) * 1000)
             FILTER (WHERE processed_at IS NOT NULL) AS avg_ms,
           max(received_at) AS last_at
    FROM public.inbound_webhook_deliveries
    WHERE received_at >= now() - interval '24 hours'),
  ai AS (
    SELECT count(*) AS req,
           count(*) FILTER (WHERE status IN ('error', 'timeout')) AS errors,
           count(*) FILTER (WHERE status = 'rate_limited') AS rate_limited,
           avg(latency_ms) FILTER (WHERE status = 'success') AS avg_ms,
           COALESCE(sum(total_tokens), 0) AS tokens,
           max(created_at) AS last_at
    FROM public.ai_request_logs
    WHERE created_at >= now() - interval '24 hours'),
  ob AS (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE status IN ('sent', 'delivered', 'read')) AS sent,
           count(*) FILTER (WHERE status IN ('failed', 'dead_letter')) AS failed,
           avg(EXTRACT(epoch FROM (sent_at - created_at)) * 1000)
             FILTER (WHERE sent_at IS NOT NULL) AS avg_send_ms,
           max(created_at) AS last_at
    FROM public.message_outbox
    WHERE created_at >= now() - interval '24 hours'),
  wf AS (
    SELECT count(*) AS runs,
           count(*) FILTER (WHERE status = 'failed') AS failed,
           count(*) FILTER (WHERE status = 'running') AS running,
           avg(duration_ms) AS avg_ms,
           max(started_at) AS last_at
    FROM public.workflow_runs
    WHERE started_at >= now() - interval '24 hours'),

  -- Queues: depth, failures, how long the oldest DUE job has waited, and how many
  -- distinct workers currently hold a lease / lock.
  qw AS (
    SELECT count(*) FILTER (WHERE status IN ('pending', 'queued', 'scheduled')) AS pending,
           count(*) FILTER (WHERE status IN ('running', 'processing', 'leased')) AS running,
           count(*) FILTER (WHERE status IN ('failed', 'dead', 'dead_letter', 'dead_lettered')
                              OR dead_lettered_at IS NOT NULL) AS failed,
           EXTRACT(epoch FROM (now() - min(run_at) FILTER (
             WHERE status IN ('pending', 'queued', 'scheduled') AND run_at <= now()))) / 60 AS oldest_min,
           array_remove(array_agg(DISTINCT leased_by) FILTER (WHERE lease_expires_at > now()), NULL) AS workers
    FROM public.workflow_queue),
  qc AS (
    SELECT count(*) FILTER (WHERE status IN ('pending', 'queued', 'scheduled')) AS pending,
           count(*) FILTER (WHERE status IN ('running', 'processing', 'sending')) AS running,
           count(*) FILTER (WHERE status IN ('failed', 'dead', 'dead_letter')) AS failed,
           EXTRACT(epoch FROM (now() - min(run_at) FILTER (
             WHERE status IN ('pending', 'queued', 'scheduled') AND run_at <= now()))) / 60 AS oldest_min,
           array_remove(array_agg(DISTINCT locked_by)
             FILTER (WHERE locked_at > now() - interval '5 minutes'), NULL) AS workers
    FROM public.campaign_dispatch_queue),
  qo AS (
    SELECT count(*) FILTER (WHERE status IN ('queued', 'processing')) AS pending,
           count(*) FILTER (WHERE status IN ('failed', 'dead_letter')) AS failed,
           EXTRACT(epoch FROM (now() - min(next_attempt_at) FILTER (
             WHERE status = 'queued' AND next_attempt_at <= now()))) / 60 AS oldest_min,
           array_remove(array_agg(DISTINCT locked_by)
             FILTER (WHERE locked_at > now() - interval '5 minutes'), NULL) AS workers
    FROM public.message_outbox),
  qh AS (
    SELECT count(*) FILTER (WHERE NOT processed AND dead_letter_at IS NULL AND last_error IS NULL) AS pending,
           count(*) FILTER (WHERE NOT processed AND (dead_letter_at IS NOT NULL OR last_error IS NOT NULL)) AS failed,
           EXTRACT(epoch FROM (now() - min(COALESCE(next_attempt_at, received_at)) FILTER (
             WHERE NOT processed AND dead_letter_at IS NULL AND last_error IS NULL
               AND COALESCE(next_attempt_at, received_at) <= now()))) / 60 AS oldest_min,
           array_remove(array_agg(DISTINCT locked_by)
             FILTER (WHERE locked_at > now() - interval '5 minutes'), NULL) AS workers
    FROM public.webhook_events),

  db AS (
    SELECT pg_database_size(current_database()) AS size_bytes,
           (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS conns,
           current_setting('max_connections')::int AS max_conns,
           d.deadlocks,
           round(100.0 * d.blks_hit / NULLIF(d.blks_hit + d.blks_read, 0), 2) AS cache_hit_pct
    FROM pg_stat_database d
    WHERE d.datname = current_database()),
  rt AS (
    SELECT (SELECT count(*) FROM public.sessions
              WHERE last_seen_at >= now() - interval '5 minutes' AND revoked_at IS NULL) AS sessions_5m,
           (SELECT count(DISTINCT user_id) FROM public.sessions
              WHERE last_seen_at >= now() - interval '15 minutes' AND revoked_at IS NULL) AS users_15m,
           (SELECT count(*) FROM public.conversations
              WHERE last_message_at >= now() - interval '5 minutes') AS convs_5m),
  st AS (
    SELECT COALESCE(sum(size_bytes), 0) AS bytes, count(*) AS files FROM public.files)

  SELECT jsonb_build_object(
    'api', jsonb_build_object(
      'req_5m', api5.req, 'err_5m', api5.err,
      'p50_ms', round(api5.p50), 'p95_ms', round(api5.p95), 'p99_ms', round(api5.p99),
      'req_24h', api24.req, 'err_24h', api24.err, 'avg_ms_24h', round(api24.avg_ms), 'last_at', api24.last_at),
    'webhooks', jsonb_build_object(
      'received_24h', wh.received, 'processed_24h', wh.processed, 'failed_24h', wh.failed,
      'rejected_24h', wh.rejected, 'stuck', wh.stuck, 'avg_ms_24h', round(wh.avg_ms), 'last_at', wh.last_at),
    'ai', jsonb_build_object(
      'req_24h', ai.req, 'errors_24h', ai.errors, 'rate_limited_24h', ai.rate_limited,
      'avg_ms_24h', round(ai.avg_ms), 'tokens_24h', ai.tokens, 'last_at', ai.last_at),
    'outbox', jsonb_build_object(
      'total_24h', ob.total, 'sent_24h', ob.sent, 'failed_24h', ob.failed,
      'avg_send_ms_24h', round(ob.avg_send_ms), 'last_at', ob.last_at),
    'workflows', jsonb_build_object(
      'runs_24h', wf.runs, 'failed_24h', wf.failed, 'running', wf.running,
      'avg_ms_24h', round(wf.avg_ms), 'last_at', wf.last_at),
    'queues', jsonb_build_object(
      'workflow',  jsonb_build_object('pending', qw.pending, 'running', qw.running, 'failed', qw.failed,
                                      'oldest_min', round(qw.oldest_min::numeric, 1)),
      'campaigns', jsonb_build_object('pending', qc.pending, 'running', qc.running, 'failed', qc.failed,
                                      'oldest_min', round(qc.oldest_min::numeric, 1)),
      'outbox',    jsonb_build_object('pending', qo.pending, 'failed', qo.failed,
                                      'oldest_min', round(qo.oldest_min::numeric, 1)),
      'webhooks',  jsonb_build_object('pending', qh.pending, 'failed', qh.failed,
                                      'oldest_min', round(qh.oldest_min::numeric, 1))),
    'workers', jsonb_build_object(
      'active', (SELECT count(DISTINCT w) FROM unnest(
                   COALESCE(qw.workers, '{}') || COALESCE(qc.workers, '{}')
                   || COALESCE(qo.workers, '{}') || COALESCE(qh.workers, '{}')) AS w)),
    'database', jsonb_build_object(
      'size_bytes', db.size_bytes, 'connections', db.conns, 'max_connections', db.max_conns,
      'deadlocks', db.deadlocks, 'cache_hit_pct', db.cache_hit_pct),
    'realtime', jsonb_build_object(
      'sessions_5m', rt.sessions_5m, 'users_15m', rt.users_15m, 'conversations_5m', rt.convs_5m),
    'storage', jsonb_build_object('bytes', st.bytes, 'files', st.files),
    'sources', jsonb_build_array(
      jsonb_build_object('id', 'api_gateway_logs', 'label', 'API gateway requests',
        'rows_24h', api24.req, 'last_at', (SELECT max(created_at) FROM public.api_gateway_logs)),
      jsonb_build_object('id', 'provider_logs', 'label', 'Provider logs',
        'rows_24h', (SELECT count(*) FROM public.provider_logs WHERE created_at >= now() - interval '24 hours'),
        'last_at', (SELECT max(created_at) FROM public.provider_logs)),
      jsonb_build_object('id', 'ai_request_logs', 'label', 'AI requests',
        'rows_24h', ai.req, 'last_at', (SELECT max(created_at) FROM public.ai_request_logs)),
      jsonb_build_object('id', 'inbound_webhook_deliveries', 'label', 'Inbound webhooks',
        'rows_24h', wh.received, 'last_at', (SELECT max(received_at) FROM public.inbound_webhook_deliveries)),
      jsonb_build_object('id', 'message_outbox', 'label', 'Message outbox',
        'rows_24h', ob.total, 'last_at', (SELECT max(created_at) FROM public.message_outbox)),
      jsonb_build_object('id', 'workflow_runs', 'label', 'Workflow runs',
        'rows_24h', wf.runs, 'last_at', (SELECT max(started_at) FROM public.workflow_runs)),
      jsonb_build_object('id', 'sessions', 'label', 'User sessions',
        'rows_24h', (SELECT count(*) FROM public.sessions WHERE last_seen_at >= now() - interval '24 hours'),
        'last_at', (SELECT max(last_seen_at) FROM public.sessions)))
  )
  FROM api5, api24, wh, ai, ob, wf, qw, qc, qo, qh, db, rt, st;
$$;

REVOKE ALL ON FUNCTION public.platform_monitoring_center() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_monitoring_center() TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Events: grouped errors, a merged log stream, and recent "traces"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_monitoring_events(_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (SELECT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500) AS n),

  -- Every failure signal in the last 24h, one row per occurrence.
  ev AS (
    SELECT 'provider:' || provider::text || ':' || COALESCE(scope, '') || ':' || left(message, 160) AS k,
           'provider.' || provider::text AS service,
           CASE WHEN level = 'error' THEN 'error' ELSE 'warning' END AS level,
           message AS message, COALESCE(scope, '') AS detail, created_at AS at
    FROM public.provider_logs
    WHERE level IN ('error', 'warn') AND created_at >= now() - interval '24 hours'
    UNION ALL
    SELECT 'ai:' || provider_kind::text || ':' || status::text || ':'
             || left(COALESCE(error_message, error_type, ''), 160),
           'ai.gateway',
           CASE WHEN status = 'rate_limited' THEN 'warning' ELSE 'error' END,
           COALESCE(error_message, error_type, 'AI request ' || status::text),
           COALESCE(feature, '') || ' ' || COALESCE(model, ''), created_at
    FROM public.ai_request_logs
    WHERE status IN ('error', 'timeout', 'rate_limited') AND created_at >= now() - interval '24 hours'
    UNION ALL
    SELECT 'webhook:' || provider || ':' || status || ':' || left(COALESCE(error_message, ''), 160),
           'webhook.' || provider,
           CASE WHEN status = 'rejected' THEN 'warning' ELSE 'error' END,
           COALESCE(error_message, 'Inbound webhook delivery ' || status),
           CASE WHEN status = 'rejected' THEN 'signature not verified' ELSE '' END, received_at
    FROM public.inbound_webhook_deliveries
    WHERE status IN ('failed', 'rejected') AND received_at >= now() - interval '24 hours'
    UNION ALL
    SELECT 'outbox:' || provider::text || ':' || COALESCE(last_error_code, '') || ':' || left(COALESCE(last_error, ''), 160),
           'outbox.' || provider::text, 'error',
           COALESCE(last_error, 'Message send failed'), COALESCE(last_error_code, ''),
           COALESCE(failed_at, updated_at)
    FROM public.message_outbox
    WHERE status IN ('failed', 'dead_letter') AND COALESCE(failed_at, updated_at) >= now() - interval '24 hours'
    UNION ALL
    SELECT 'workflow:' || left(COALESCE(error ->> 'message', error::text, ''), 160),
           'workflow', 'error',
           COALESCE(error ->> 'message', left(error::text, 200), 'Workflow run failed'),
           COALESCE(trigger_source, ''), started_at
    FROM public.workflow_runs
    WHERE status = 'failed' AND started_at >= now() - interval '24 hours'
    UNION ALL
    SELECT 'api:' || method || ':' || path || ':' || status_code::text,
           'api', 'error',
           status_code::text || ' ' || method || ' ' || path,
           COALESCE(error, ''), created_at
    FROM public.api_gateway_logs
    WHERE status_code >= 500 AND created_at >= now() - interval '24 hours'
  ),
  errs AS (
    SELECT md5(k) AS id,
           (array_agg(message ORDER BY at DESC))[1] AS message,
           service, level,
           count(*) AS count,
           min(at) AS first_seen, max(at) AS last_seen,
           (array_agg(detail ORDER BY at DESC))[1] AS detail
    FROM ev
    GROUP BY k, service, level
    ORDER BY max(at) DESC
    LIMIT 50
  ),

  -- Merged operational log stream.
  logs AS (
    SELECT ts, level, service, message FROM (
      SELECT created_at AS ts,
             CASE level WHEN 'error' THEN 'error' WHEN 'warn' THEN 'warn' WHEN 'debug' THEN 'debug' ELSE 'info' END AS level,
             provider::text AS service,
             COALESCE(scope || ': ', '') || message AS message
      FROM public.provider_logs WHERE created_at >= now() - interval '24 hours'
      UNION ALL
      SELECT created_at,
             CASE WHEN status = 'success' THEN 'info' WHEN status = 'rate_limited' THEN 'warn' ELSE 'error' END,
             'ai',
             COALESCE(operation::text, 'request') || ' ' || COALESCE(model, '') || ' -> ' || status::text
               || COALESCE(' — ' || error_message, '')
      FROM public.ai_request_logs WHERE created_at >= now() - interval '24 hours'
      UNION ALL
      SELECT received_at,
             CASE status WHEN 'failed' THEN 'error' WHEN 'rejected' THEN 'warn' ELSE 'info' END,
             'webhook.' || provider,
             'delivery ' || status || COALESCE(' — ' || error_message, '')
      FROM public.inbound_webhook_deliveries WHERE received_at >= now() - interval '24 hours'
      UNION ALL
      SELECT created_at,
             CASE WHEN status_code >= 500 THEN 'error' WHEN status_code >= 400 THEN 'warn' ELSE 'info' END,
             'api',
             method || ' ' || path || ' -> ' || status_code::text || ' (' || COALESCE(latency_ms, 0)::text || 'ms)'
      FROM public.api_gateway_logs WHERE created_at >= now() - interval '24 hours'
    ) u
    ORDER BY ts DESC
    LIMIT (SELECT n FROM lim)
  ),

  -- "Traces": the most recent request-shaped units of work. There is no
  -- distributed tracing in this app, so a trace here is one API request, one AI
  -- call, one workflow run (spans = its steps) or one outbound message.
  traces AS (
    SELECT trace_id, name, service, duration_ms, started_at, ok, spans FROM (
      SELECT 'api:' || left(id::text, 8) AS trace_id, method || ' ' || path AS name, 'api' AS service,
             COALESCE(latency_ms, 0)::int AS duration_ms, created_at AS started_at,
             (status_code < 500) AS ok, 1 AS spans
      FROM public.api_gateway_logs WHERE created_at >= now() - interval '24 hours'
      UNION ALL
      SELECT 'ai:' || left(id::text, 8), COALESCE(feature, operation::text, 'ai') || ' · ' || COALESCE(model, ''),
             'ai', COALESCE(latency_ms, 0)::int, created_at, (status = 'success'), 1
      FROM public.ai_request_logs WHERE created_at >= now() - interval '24 hours'
      UNION ALL
      SELECT 'wf:' || left(r.id::text, 8), 'workflow.run · ' || COALESCE(r.trigger_source, ''),
             'workflow', COALESCE(r.duration_ms, 0)::int, r.started_at, (r.status <> 'failed'),
             GREATEST(1, (SELECT count(*) FROM public.workflow_run_steps s WHERE s.run_id = r.id))::int
      FROM public.workflow_runs r WHERE r.started_at >= now() - interval '24 hours'
      UNION ALL
      SELECT 'out:' || left(id::text, 8), 'outbox.send · ' || provider::text,
             'outbox',
             COALESCE(round(EXTRACT(epoch FROM (sent_at - created_at)) * 1000)::int, 0),
             created_at, (status NOT IN ('failed', 'dead_letter')), 1
      FROM public.message_outbox WHERE created_at >= now() - interval '24 hours'
    ) u
    ORDER BY started_at DESC
    LIMIT LEAST((SELECT n FROM lim), 50)
  )

  SELECT jsonb_build_object(
    'errors', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.last_seen DESC) FROM errs e), '[]'::jsonb),
    'logs',   COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.ts DESC) FROM logs l), '[]'::jsonb),
    'traces', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.started_at DESC) FROM traces t), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.platform_monitoring_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_monitoring_events(integer) TO service_role;
