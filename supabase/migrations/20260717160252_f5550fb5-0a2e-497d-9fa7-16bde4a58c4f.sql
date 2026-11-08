ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_run_status text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb;

CREATE TABLE IF NOT EXISTS public.workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  graph jsonb NOT NULL,
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, version)
);
CREATE INDEX IF NOT EXISTS idx_wf_versions_workspace ON public.workflow_versions(workspace_id, automation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_versions TO authenticated;
GRANT ALL ON public.workflow_versions TO service_role;
ALTER TABLE public.workflow_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_versions by workspace member" ON public.workflow_versions
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  trigger_source text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error jsonb,
  duration_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wf_runs_workspace_status ON public.workflow_runs(workspace_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_runs_automation ON public.workflow_runs(automation_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_runs TO authenticated;
GRANT ALL ON public.workflow_runs TO service_role;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_runs by workspace member" ON public.workflow_runs
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.workflow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  input jsonb,
  output jsonb,
  error jsonb,
  duration_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wf_run_steps_run ON public.workflow_run_steps(run_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_run_steps TO authenticated;
GRANT ALL ON public.workflow_run_steps TO service_role;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_run_steps by workspace member" ON public.workflow_run_steps
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_run_steps;