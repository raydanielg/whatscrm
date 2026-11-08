ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_automations_workspace_updated ON public.automations (workspace_id, updated_at DESC);