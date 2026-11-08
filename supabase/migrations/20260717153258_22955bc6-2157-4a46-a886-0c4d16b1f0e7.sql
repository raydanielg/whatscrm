
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule jsonb,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_archived_at ON public.campaigns(workspace_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_approval ON public.campaigns(workspace_id, approval_status);
