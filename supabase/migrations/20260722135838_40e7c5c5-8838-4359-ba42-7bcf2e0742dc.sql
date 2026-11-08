
-- Idempotency + DLQ + stuck-run recovery for workflow reliability
ALTER TABLE public.workflow_queue
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_queue_idem_uidx
  ON public.workflow_queue (workspace_id, automation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_queue_status_run_at_idx
  ON public.workflow_queue (status, run_at);

CREATE INDEX IF NOT EXISTS workflow_runs_status_started_idx
  ON public.workflow_runs (status, started_at);
