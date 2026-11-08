-- Atomically reserve only a bounded set of due rows. SKIP LOCKED prevents two
-- cron invocations from dispatching the same scheduled message.
CREATE OR REPLACE FUNCTION public.claim_due_scheduled_messages(p_batch integer DEFAULT 50)
RETURNS SETOF public.scheduled_messages
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH due AS (
    SELECT id
    FROM public.scheduled_messages
    WHERE status = 'pending'
      AND scheduled_for <= now()
      AND metadata->>'channel' IS DISTINCT FROM 'messenger'
    ORDER BY scheduled_for, id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_batch, 50), 1), 200)
  )
  UPDATE public.scheduled_messages AS scheduled
  SET status = 'processing'
  FROM due
  WHERE scheduled.id = due.id
  RETURNING scheduled.*;
$function$;

REVOKE ALL ON FUNCTION public.claim_due_scheduled_messages(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_messages(integer) TO service_role;

-- Keep one Messenger flush job. The legacy duplicate can race it.
DO $block$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL AND EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'wa-flush-scheduled-messages'
  ) AND EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'flush-scheduled-messages'
  ) THEN
    PERFORM cron.unschedule('wa-flush-scheduled-messages');
  END IF;
END
$block$;
