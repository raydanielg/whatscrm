-- Real per-day analytics for the Analytics / Reports / Omnichannel pages.
--
-- Those pages used to render fabricated series (Math.random() in the browser)
-- in every mode, so a production workspace saw invented delivery rates and
-- charts. This function returns the real numbers in one round trip.
--
-- SECURITY INVOKER on purpose: it reads messages / conversations /
-- csat_responses as the caller, so RLS scopes the result to workspaces the
-- caller can already read. Passing someone else's workspace id returns zeros.
--
-- Days are bucketed in UTC. Synthetic rows (is_demo), soft-deleted rows,
-- internal notes and system messages are excluded, matching what the Inbox shows.

-- Re-runnable across return-type changes (CREATE OR REPLACE cannot alter OUT columns).
DROP FUNCTION IF EXISTS public.analytics_daily_summary(uuid, integer);

CREATE OR REPLACE FUNCTION public.analytics_daily_summary(
  _workspace_id uuid,
  _days integer DEFAULT 14
)
RETURNS TABLE (
  day                   date,
  msgs_by_channel       jsonb,
  messages_total        bigint,
  outbound_sent         bigint,
  outbound_delivered    bigint,
  outbound_read         bigint,
  conversations_opened  bigint,
  avg_first_response_sec numeric,
  first_response_count  bigint,
  avg_resolution_min    numeric,
  resolved_count        bigint,
  csat_avg              numeric,
  csat_count            bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT LEAST(GREATEST(COALESCE(_days, 14), 1), 366) AS n
  ),
  days AS (
    SELECT ((now() AT TIME ZONE 'utc')::date - g) AS day
    FROM bounds, generate_series(0, (SELECT n FROM bounds) - 1) AS g
  ),
  window_start AS (
    SELECT (min(day)::timestamp AT TIME ZONE 'utc') AS ts FROM days
  ),
  msg AS (
    SELECT (m.created_at AT TIME ZONE 'utc')::date AS day,
           c.channel::text AS channel,
           m.direction, m.status, m.delivered_at, m.read_at
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.workspace_id = _workspace_id
      AND m.is_demo = false
      AND m.deleted_at IS NULL
      AND m.is_internal = false
      AND m.message_type <> 'system'
      AND m.created_at >= (SELECT ts FROM window_start)
  ),
  per_channel AS (
    SELECT day, jsonb_object_agg(channel, cnt) AS by_channel
    FROM (SELECT day, channel, count(*) AS cnt FROM msg GROUP BY day, channel) x
    GROUP BY day
  ),
  msg_totals AS (
    SELECT day,
           count(*) AS messages_total,
           count(*) FILTER (WHERE direction = 'outbound'
                              AND status IN ('sent', 'delivered', 'read'))            AS outbound_sent,
           count(*) FILTER (WHERE direction = 'outbound'
                              AND (status IN ('delivered', 'read')
                                   OR delivered_at IS NOT NULL))                     AS outbound_delivered,
           count(*) FILTER (WHERE direction = 'outbound'
                              AND (status = 'read' OR read_at IS NOT NULL))          AS outbound_read
    FROM msg GROUP BY day
  ),
  opened AS (
    SELECT (c.created_at AT TIME ZONE 'utc')::date AS day,
           count(*) AS conversations_opened,
           avg(EXTRACT(epoch FROM (c.first_response_at - c.created_at)))
             FILTER (WHERE c.first_response_at IS NOT NULL
                       AND c.first_response_at >= c.created_at)                       AS avg_first_response_sec,
           count(*) FILTER (WHERE c.first_response_at IS NOT NULL
                              AND c.first_response_at >= c.created_at)                AS first_response_count
    FROM public.conversations c
    WHERE c.workspace_id = _workspace_id
      AND c.is_demo = false
      AND c.deleted_at IS NULL
      AND c.created_at >= (SELECT ts FROM window_start)
    GROUP BY 1
  ),
  resolved AS (
    SELECT (c.resolved_at AT TIME ZONE 'utc')::date AS day,
           avg(EXTRACT(epoch FROM (c.resolved_at - c.created_at)) / 60.0)             AS avg_resolution_min,
           count(*)                                                                   AS resolved_count
    FROM public.conversations c
    WHERE c.workspace_id = _workspace_id
      AND c.is_demo = false
      AND c.deleted_at IS NULL
      AND c.resolved_at IS NOT NULL
      AND c.resolved_at >= c.created_at
      AND c.resolved_at >= (SELECT ts FROM window_start)
    GROUP BY 1
  ),
  csat AS (
    SELECT (COALESCE(r.submitted_at, r.created_at) AT TIME ZONE 'utc')::date AS day,
           avg(r.rating)::numeric AS csat_avg,
           count(*)               AS csat_count
    FROM public.csat_responses r
    WHERE r.workspace_id = _workspace_id
      AND r.rating BETWEEN 1 AND 5
      AND COALESCE(r.score_type, 'csat') = 'csat'
      AND COALESCE(r.submitted_at, r.created_at) >= (SELECT ts FROM window_start)
    GROUP BY 1
  )
  SELECT d.day,
         COALESCE(pc.by_channel, '{}'::jsonb),
         COALESCE(mt.messages_total, 0),
         COALESCE(mt.outbound_sent, 0),
         COALESCE(mt.outbound_delivered, 0),
         COALESCE(mt.outbound_read, 0),
         COALESCE(o.conversations_opened, 0),
         o.avg_first_response_sec,
         COALESCE(o.first_response_count, 0),
         rs.avg_resolution_min,
         COALESCE(rs.resolved_count, 0),
         cs.csat_avg,
         COALESCE(cs.csat_count, 0)
  FROM days d
  LEFT JOIN per_channel pc ON pc.day = d.day
  LEFT JOIN msg_totals  mt ON mt.day = d.day
  LEFT JOIN opened      o  ON o.day  = d.day
  LEFT JOIN resolved    rs ON rs.day = d.day
  LEFT JOIN csat        cs ON cs.day = d.day
  ORDER BY d.day;
$$;

REVOKE ALL ON FUNCTION public.analytics_daily_summary(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_daily_summary(uuid, integer) TO authenticated, service_role;
