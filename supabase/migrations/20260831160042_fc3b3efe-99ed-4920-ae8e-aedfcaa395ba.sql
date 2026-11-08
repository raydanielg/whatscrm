ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required'
  CONSTRAINT social_posts_approval_status_check
  CHECK (approval_status IN ('not_required','pending','approved','rejected'));

CREATE INDEX IF NOT EXISTS idx_social_posts_pending_approval
  ON public.social_posts (workspace_id, approval_status)
  WHERE approval_status = 'pending';