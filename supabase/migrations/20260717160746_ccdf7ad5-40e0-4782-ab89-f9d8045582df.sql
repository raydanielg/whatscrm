
CREATE TABLE IF NOT EXISTS public.workflow_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  trigger_source TEXT NOT NULL DEFAULT 'event',
  event_type TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority SMALLINT NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  leased_by TEXT,
  last_error JSONB,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_queue_ready
  ON public.workflow_queue (status, run_at, priority)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_wf_queue_workspace ON public.workflow_queue (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_queue_automation ON public.workflow_queue (automation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_queue TO authenticated;
GRANT ALL ON public.workflow_queue TO service_role;

ALTER TABLE public.workflow_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wf_queue by workspace member"
ON public.workflow_queue
FOR ALL TO authenticated
USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE TRIGGER trg_wf_queue_updated
BEFORE UPDATE ON public.workflow_queue
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.wf_queue_lease(_worker TEXT, _batch INT, _lease_seconds INT)
RETURNS SETOF public.workflow_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ready AS (
    SELECT id FROM public.workflow_queue
    WHERE (
        (status = 'queued' AND run_at <= now())
        OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < now())
    )
    ORDER BY priority ASC, run_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _batch
  )
  UPDATE public.workflow_queue q
  SET status = 'running',
      leased_by = _worker,
      lease_expires_at = now() + make_interval(secs => _lease_seconds),
      attempts = q.attempts + 1,
      updated_at = now()
  FROM ready
  WHERE q.id = ready.id
  RETURNING q.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wf_queue_lease(TEXT, INT, INT) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'workflow_queue'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_queue';
  END IF;
END $$;
