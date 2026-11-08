
CREATE TABLE public.instagram_comment_automation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  post_id TEXT,
  comment_id TEXT,
  commenter_username TEXT,
  commenter_ig_id TEXT,
  comment_text TEXT,
  matched BOOLEAN NOT NULL DEFAULT false,
  match_reason TEXT,
  matched_keywords TEXT[] NOT NULL DEFAULT '{}',
  actions_taken JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'processed',
  error TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ig_cal_workspace_time ON public.instagram_comment_automation_logs(workspace_id, processed_at DESC);
CREATE INDEX idx_ig_cal_automation_time ON public.instagram_comment_automation_logs(automation_id, processed_at DESC);

GRANT SELECT ON public.instagram_comment_automation_logs TO authenticated;
GRANT ALL ON public.instagram_comment_automation_logs TO service_role;

ALTER TABLE public.instagram_comment_automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view logs in their workspace"
ON public.instagram_comment_automation_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = instagram_comment_automation_logs.workspace_id
      AND wm.user_id = auth.uid()
  )
);
