
-- 1. Extend whatsapp_qr_sessions -----------------------------------------
ALTER TABLE public.whatsapp_qr_sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS qr_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

-- Default expiration for newly created rows: 10 minutes from creation
ALTER TABLE public.whatsapp_qr_sessions
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '10 minutes');

-- Backfill nulls so cleanup can act on legacy rows
UPDATE public.whatsapp_qr_sessions
   SET expires_at = created_at + interval '10 minutes'
 WHERE expires_at IS NULL;

-- Tenant + status indexing (idempotent — original migration added a similar one)
CREATE INDEX IF NOT EXISTS idx_wa_qr_sessions_workspace_created
  ON public.whatsapp_qr_sessions(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_qr_sessions_expires
  ON public.whatsapp_qr_sessions(expires_at)
  WHERE status IN ('pending', 'awaiting_scan', 'scanned', 'connecting');

CREATE INDEX IF NOT EXISTS idx_wa_qr_sessions_last_seen
  ON public.whatsapp_qr_sessions(workspace_id, last_seen_at DESC);

-- One active connected session per (workspace, phone_number)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_qr_sessions_connected_phone
  ON public.whatsapp_qr_sessions(workspace_id, phone_number)
  WHERE status = 'connected' AND phone_number IS NOT NULL;

-- 2. Audit trail table ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_qr_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_qr_sessions(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_qr_events_session
  ON public.whatsapp_qr_session_events(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_qr_events_workspace
  ON public.whatsapp_qr_session_events(workspace_id, created_at DESC);

GRANT SELECT, INSERT ON public.whatsapp_qr_session_events TO authenticated;
GRANT ALL ON public.whatsapp_qr_session_events TO service_role;

ALTER TABLE public.whatsapp_qr_session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view workspace QR events"
  ON public.whatsapp_qr_session_events FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = whatsapp_qr_session_events.workspace_id
      AND wm.user_id = auth.uid()
  ));

CREATE POLICY "Members insert workspace QR events"
  ON public.whatsapp_qr_session_events FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = whatsapp_qr_session_events.workspace_id
      AND wm.user_id = auth.uid()
  ));

-- 3. Status-change trigger — automatic audit log -------------------------
CREATE OR REPLACE FUNCTION public.tg_wa_qr_session_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.whatsapp_qr_session_events
      (session_id, workspace_id, event_type, to_status, actor_user_id, details)
    VALUES
      (NEW.id, NEW.workspace_id, 'created', NEW.status, NEW.created_by, '{}'::jsonb);
  ELSIF (TG_OP = 'UPDATE') AND (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.whatsapp_qr_session_events
      (session_id, workspace_id, event_type, from_status, to_status, actor_user_id, details)
    VALUES
      (NEW.id, NEW.workspace_id, 'status_changed', OLD.status, NEW.status, auth.uid(),
       jsonb_build_object('phone_number', NEW.phone_number, 'error', NEW.error_message));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_qr_sessions_log ON public.whatsapp_qr_sessions;
CREATE TRIGGER whatsapp_qr_sessions_log
  AFTER INSERT OR UPDATE ON public.whatsapp_qr_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_qr_session_log();

-- 4. Cleanup function ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_qr_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count int := 0;
  purged_count int := 0;
BEGIN
  -- Expire pending sessions whose window has passed
  UPDATE public.whatsapp_qr_sessions
     SET status = 'expired',
         error_message = COALESCE(error_message, 'QR session expired without scan')
   WHERE status IN ('pending', 'awaiting_scan', 'scanned', 'connecting')
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;

  -- Purge terminated sessions older than 30 days
  DELETE FROM public.whatsapp_qr_sessions
   WHERE status IN ('revoked', 'disconnected', 'expired', 'error')
     AND updated_at < now() - interval '30 days';
  GET DIAGNOSTICS purged_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired', expired_count,
    'purged',  purged_count,
    'ran_at',  now()
  );
END;
$$;

-- 5. Schedule cleanup every 5 minutes (pg_cron, SQL-only) ---------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-qr-sessions-cleanup') THEN
    PERFORM cron.unschedule('whatsapp-qr-sessions-cleanup');
  END IF;
  PERFORM cron.schedule(
    'whatsapp-qr-sessions-cleanup',
    '*/5 * * * *',
    $cron$ SELECT public.cleanup_whatsapp_qr_sessions(); $cron$
  );
END $$;
