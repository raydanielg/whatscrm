ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_conversations_ws_is_demo ON public.conversations(workspace_id, is_demo) WHERE is_demo = false;
CREATE INDEX IF NOT EXISTS idx_messages_conv_is_demo ON public.messages(conversation_id, is_demo) WHERE is_demo = false;