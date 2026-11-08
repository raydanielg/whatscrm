-- Enum for supported sync kinds
DO $$ BEGIN
  CREATE TYPE public.sync_kind AS ENUM (
    'templates', 'business_profile', 'phone_numbers', 'media_cleanup',
    'webhook_drain', 'outbox_drain', 'scheduled_messages',
    'contacts_reconcile', 'conversations_reconcile', 'status_reconcile',
    'account_health'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sync_status AS ENUM ('pending', 'running', 'success', 'partial', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_account_id uuid REFERENCES public.channel_accounts(id) ON DELETE SET NULL,
  kind public.sync_kind NOT NULL,
  status public.sync_status NOT NULL DEFAULT 'pending',
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_source text NOT NULL DEFAULT 'manual', -- manual | cron | webhook | retry
  correlation_id text,
  parent_job_id uuid REFERENCES public.sync_jobs(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  items_processed integer NOT NULL DEFAULT 0,
  items_succeeded integer NOT NULL DEFAULT 0,
  items_failed integer NOT NULL DEFAULT 0,
  attempt integer NOT NULL DEFAULT 1,
  next_retry_at timestamptz,
  error text,
  cursor_before timestamptz,
  cursor_after timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_ws_time ON public.sync_jobs(workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_kind_status ON public.sync_jobs(workspace_id, kind, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_retry ON public.sync_jobs(next_retry_at) WHERE next_retry_at IS NOT NULL AND status = 'failed';

GRANT SELECT ON public.sync_jobs TO authenticated;
GRANT ALL ON public.sync_jobs TO service_role;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_jobs: workspace admins read"
  ON public.sync_jobs FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_sync_jobs_updated
  BEFORE UPDATE ON public.sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Cursors: one row per (workspace, channel_account, kind)
CREATE TABLE IF NOT EXISTS public.sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_account_id uuid REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  kind public.sync_kind NOT NULL,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  last_job_id uuid REFERENCES public.sync_jobs(id) ON DELETE SET NULL,
  cursor_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel_account_id, kind)
);

GRANT SELECT ON public.sync_cursors TO authenticated;
GRANT ALL ON public.sync_cursors TO service_role;
ALTER TABLE public.sync_cursors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_cursors: workspace members read"
  ON public.sync_cursors FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_sync_cursors_updated
  BEFORE UPDATE ON public.sync_cursors
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Realtime
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='sync_jobs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_jobs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='sync_cursors') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_cursors;
  END IF;
END $$;

ALTER TABLE public.sync_jobs    REPLICA IDENTITY FULL;
ALTER TABLE public.sync_cursors REPLICA IDENTITY FULL;