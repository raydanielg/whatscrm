-- Atomic claiming for the campaign dispatch queue, plus a server-side guard on
-- campaign status transitions.
--
-- The dispatcher used to claim work in two statements:
--
--   SELECT id FROM campaign_dispatch_queue WHERE status = 'pending' ...
--   UPDATE campaign_dispatch_queue SET status = 'processing' WHERE id IN (...)
--
-- The UPDATE re-checked `status = 'pending'`, so two overlapping workers could
-- not both flip the same row — but each still SELECTed the same 500 ids and the
-- loser simply got fewer rows back. Worse, a row left in `processing` by a
-- crashed worker was never picked up again: the due index only matches
-- `pending`, so the recipient silently never sent.
--
-- `claim_campaign_dispatch_batch` replaces both statements with one
-- UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING. Rows locked by
-- a concurrent claim are skipped rather than contended, so N workers partition
-- the queue between them and one row is handed to exactly one worker.
--
-- `attempts` is incremented at CLAIM time, not at failure time. A worker that
-- dies after calling Meta but before writing the result has already spent an
-- attempt, so an interrupted send cannot retry forever — it is bounded by
-- max_attempts like any other failure. See the residual-risk note in
-- src/lib/marketing/delivery.server.ts: the Cloud API has no client-supplied
-- idempotency key, so this bound is the protection available.

-- ---------------------------------------------------------------------------
-- 1) Retire rows that have exhausted their attempts
-- ---------------------------------------------------------------------------
-- Run before claiming so an exhausted row is terminated instead of being
-- claimed, failed and re-examined on every tick.
CREATE OR REPLACE FUNCTION public.expire_campaign_dispatch_attempts(
  p_stale_after interval DEFAULT interval '5 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH exhausted AS (
    SELECT id
    FROM public.campaign_dispatch_queue
    WHERE attempts >= max_attempts
      AND (
        (status = 'pending' AND run_at <= now())
        OR (status = 'processing' AND locked_at IS NOT NULL AND locked_at < now() - p_stale_after)
      )
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.campaign_dispatch_queue q
  SET status = 'failed',
      locked_at = NULL,
      locked_by = NULL,
      processed_at = now(),
      last_error = COALESCE(q.last_error, 'Abandoned after the maximum number of delivery attempts.')
  FROM exhausted e
  WHERE q.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_campaign_dispatch_attempts(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_campaign_dispatch_attempts(interval) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Atomic claim
-- ---------------------------------------------------------------------------
-- A row is claimable when it is due and pending, or when it is `processing`
-- under a lock older than p_stale_after (the previous worker is gone). An
-- active lock is younger than that and is therefore never stolen.
CREATE OR REPLACE FUNCTION public.claim_campaign_dispatch_batch(
  p_worker_id text,
  p_limit integer DEFAULT 500,
  p_stale_after interval DEFAULT interval '5 minutes'
)
RETURNS SETOF public.campaign_dispatch_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimable AS (
    SELECT id
    FROM public.campaign_dispatch_queue
    WHERE attempts < max_attempts
      AND (
        (status = 'pending' AND run_at <= now())
        OR (status = 'processing' AND locked_at IS NOT NULL AND locked_at < now() - p_stale_after)
      )
    ORDER BY priority ASC, run_at ASC
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.campaign_dispatch_queue q
  SET status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      attempts = q.attempts + 1
  FROM claimable c
  WHERE q.id = c.id
  RETURNING q.*;
$$;

REVOKE ALL ON FUNCTION public.claim_campaign_dispatch_batch(text, integer, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_campaign_dispatch_batch(text, integer, interval) TO service_role;

-- The claim predicate now also matches stale `processing` rows, so the
-- partial index on `pending` alone no longer covers it.
CREATE INDEX IF NOT EXISTS dispatch_queue_claimable_idx
  ON public.campaign_dispatch_queue (status, priority, run_at)
  WHERE status IN ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- 3) Server-side readiness guard on status transitions
-- ---------------------------------------------------------------------------
-- `campaigns` is written directly from the client under RLS, so a caller that
-- skips the wizard could previously set status = 'scheduled' on a draft with no
-- template at all. Variable mapping and audience size are enforced in
-- `enqueueCampaign` (the only path that creates queue rows); the structural
-- facts that SQL can check are enforced here so no path can bypass them.
CREATE OR REPLACE FUNCTION public.enforce_campaign_launch_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template record;
  v_account record;
BEGIN
  -- Only guard the transition INTO a live state. Updates that leave an already
  -- running campaign running (counters, completed_at) must not be blocked.
  IF NEW.status NOT IN ('scheduled', 'running') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.channel, '') <> 'whatsapp' THEN
    RAISE EXCEPTION 'Campaign % cannot be launched: channel must be whatsapp', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.template_id IS NULL THEN
    RAISE EXCEPTION 'Campaign % cannot be launched: no WhatsApp template selected', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, name, status, language, channel_account_id
    INTO v_template
  FROM public.wa_templates
  WHERE id = NEW.template_id AND workspace_id = NEW.workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign % cannot be launched: template not found in this workspace', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF upper(COALESCE(v_template.status::text, '')) <> 'APPROVED' THEN
    RAISE EXCEPTION 'Campaign % cannot be launched: template % is not approved', NEW.id, v_template.name
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(btrim(v_template.language), '') = '' THEN
    RAISE EXCEPTION 'Campaign % cannot be launched: template % has no language code', NEW.id, v_template.name
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, status, workspace_id INTO v_account
  FROM public.channel_accounts
  WHERE id = v_template.channel_account_id;

  IF NOT FOUND OR v_account.workspace_id <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Campaign % cannot be launched: the template has no WhatsApp sender in this workspace', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(v_account.status::text, '') <> 'connected' THEN
    RAISE EXCEPTION 'Campaign % cannot be launched: the WhatsApp sender is %', NEW.id, COALESCE(v_account.status::text, 'not connected')
      USING ERRCODE = 'check_violation';
  END IF;

  -- A scheduled campaign must have a future time. One minute of slack matches
  -- SCHEDULE_PAST_TOLERANCE_MS in src/lib/marketing/readiness.ts.
  IF NEW.status = 'scheduled' THEN
    IF NEW.scheduled_at IS NULL THEN
      RAISE EXCEPTION 'Campaign % cannot be scheduled: no scheduled_at', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.scheduled_at < now() - interval '1 minute' THEN
      RAISE EXCEPTION 'Campaign % cannot be scheduled in the past', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_launch_readiness ON public.campaigns;
CREATE TRIGGER campaigns_launch_readiness
  BEFORE INSERT OR UPDATE OF status ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_launch_readiness();
