
CREATE TABLE public.contact_rematch_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  scope TEXT NOT NULL DEFAULT 'whatsapp' CHECK (scope IN ('whatsapp','all')),
  unlinked_only BOOLEAN NOT NULL DEFAULT false,
  since TIMESTAMPTZ,
  max_conversations INTEGER NOT NULL DEFAULT 1000 CHECK (max_conversations BETWEEN 1 AND 20000),
  total_scanned INTEGER NOT NULL DEFAULT 0,
  total_matched INTEGER NOT NULL DEFAULT 0,
  total_relinked INTEGER NOT NULL DEFAULT 0,
  total_unchanged INTEGER NOT NULL DEFAULT 0,
  total_skipped INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contact_rematch_jobs_workspace_created_idx
  ON public.contact_rematch_jobs (workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_rematch_jobs TO authenticated;
GRANT ALL ON public.contact_rematch_jobs TO service_role;

ALTER TABLE public.contact_rematch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read rematch jobs"
  ON public.contact_rematch_jobs FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace admins manage rematch jobs"
  ON public.contact_rematch_jobs FOR ALL
  TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE TRIGGER update_contact_rematch_jobs_updated_at
  BEFORE UPDATE ON public.contact_rematch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
