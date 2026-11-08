
ALTER TABLE public.chatbots
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS chatbots_workspace_deleted_idx
  ON public.chatbots (workspace_id, deleted_at);
