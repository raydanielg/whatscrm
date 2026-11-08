
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS dedupe_key       text,
  ADD COLUMN IF NOT EXISTS next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at        timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by        text,
  ADD COLUMN IF NOT EXISTS max_attempts     integer     NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS last_error       text,
  ADD COLUMN IF NOT EXISTS last_error_kind  text,
  ADD COLUMN IF NOT EXISTS dead_letter_at   timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_dedupe_key
  ON public.webhook_events(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_queue
  ON public.webhook_events(next_attempt_at)
  WHERE processed = false AND dead_letter_at IS NULL;

CREATE OR REPLACE FUNCTION public.webhook_events_claim_batch(_worker text, _limit integer DEFAULT 25)
RETURNS SETOF public.webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.webhook_events
     WHERE processed = false
       AND dead_letter_at IS NULL
       AND signature_valid = true
       AND next_attempt_at <= now()
     ORDER BY next_attempt_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT _limit
  )
  UPDATE public.webhook_events e
     SET attempts   = e.attempts + 1,
         locked_at  = now(),
         locked_by  = _worker,
         updated_at = now()
    FROM claimed
   WHERE e.id = claimed.id
  RETURNING e.*;
END;
$$;

REVOKE ALL ON FUNCTION public.webhook_events_claim_batch(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.webhook_events_claim_batch(text, integer) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='webhook_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='channel_accounts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_accounts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='wa_templates') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_templates;
  END IF;
END $$;

ALTER TABLE public.webhook_events   REPLICA IDENTITY FULL;
ALTER TABLE public.channel_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.wa_templates     REPLICA IDENTITY FULL;
