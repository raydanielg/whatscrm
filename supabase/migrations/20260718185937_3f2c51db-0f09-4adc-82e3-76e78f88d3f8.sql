ALTER TABLE public.chatbot_messages ADD COLUMN IF NOT EXISTS attachments jsonb;
ALTER TABLE public.chatbot_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.chatbot_sessions ADD COLUMN IF NOT EXISTS rating smallint;
ALTER TABLE public.chatbot_sessions ADD COLUMN IF NOT EXISTS rating_comment text;
ALTER TABLE public.chatbot_sessions ADD COLUMN IF NOT EXISTS rated_at timestamptz;