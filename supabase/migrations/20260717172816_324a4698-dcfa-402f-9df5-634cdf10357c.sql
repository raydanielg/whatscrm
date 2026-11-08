
DO $$ BEGIN
  CREATE TYPE public.export_dataset AS ENUM ('report','crm_contacts','crm_companies','crm_deals','crm_leads','campaigns','conversations','messages','tasks','activities');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.export_format AS ENUM ('pdf','excel','csv','json');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.export_status AS ENUM ('queued','running','success','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.export_recurrence AS ENUM ('once','daily','weekly','monthly','quarterly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  created_by uuid NOT NULL,
  name text NOT NULL,
  description text,
  dataset public.export_dataset NOT NULL,
  format public.export_format NOT NULL,
  report_id uuid,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  columns text[] NOT NULL DEFAULT '{}',
  status public.export_status NOT NULL DEFAULT 'queued',
  recurrence public.export_recurrence NOT NULL DEFAULT 'once',
  cron text,
  next_run_at timestamptz,
  last_run_at timestamptz,
  file_path text,
  file_bucket text,
  file_size bigint,
  row_count integer,
  duration_ms integer,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','workspace')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_jobs_ws_created_idx ON public.export_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS export_jobs_status_idx ON public.export_jobs(status, next_run_at) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS export_jobs_recurrence_idx ON public.export_jobs(next_run_at) WHERE recurrence <> 'once';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_jobs TO authenticated;
GRANT ALL ON public.export_jobs TO service_role;

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own or workspace-visible exports" ON public.export_jobs;
CREATE POLICY "Members read own or workspace-visible exports" ON public.export_jobs
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid()) AND (
      created_by = auth.uid()
      OR visibility = 'workspace'
      OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','manager']::workspace_role[])
    )
  );

DROP POLICY IF EXISTS "Members create their own exports" ON public.export_jobs;
CREATE POLICY "Members create their own exports" ON public.export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Owners/admins update; users update own" ON public.export_jobs;
CREATE POLICY "Owners/admins update; users update own" ON public.export_jobs
  FOR UPDATE TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid()) AND (
      created_by = auth.uid()
      OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','manager']::workspace_role[])
    )
  );

DROP POLICY IF EXISTS "Owners/admins delete; users delete own" ON public.export_jobs;
CREATE POLICY "Owners/admins delete; users delete own" ON public.export_jobs
  FOR DELETE TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid()) AND (
      created_by = auth.uid()
      OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin','manager']::workspace_role[])
    )
  );

CREATE OR REPLACE FUNCTION public.tg_export_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS export_jobs_updated_at ON public.export_jobs;
CREATE TRIGGER export_jobs_updated_at BEFORE UPDATE ON public.export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_export_jobs_updated_at();

-- Atomic worker claim
CREATE OR REPLACE FUNCTION public.export_jobs_claim_batch(_worker text, _limit integer DEFAULT 5)
RETURNS SETOF public.export_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  WITH ready AS (
    SELECT id FROM public.export_jobs
     WHERE status = 'queued'
       AND (next_run_at IS NULL OR next_run_at <= now())
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT _limit
  )
  UPDATE public.export_jobs e
     SET status='running',
         attempts = e.attempts + 1,
         locked_at = now(),
         locked_by = _worker,
         started_at = now(),
         updated_at = now()
    FROM ready
   WHERE e.id = ready.id
  RETURNING e.*;
END; $$;

-- pg_cron dispatcher
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN
  PERFORM cron.unschedule('export-jobs-dispatch');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'export-jobs-dispatch',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--206182b2-0a34-4382-9e54-92466a9ffea8.lovable.app/api/public/hooks/process-exports',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_vIQQo4PPa-PbG3Zs-kz5vw_bdCne7Sh"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  );
  $$
);
