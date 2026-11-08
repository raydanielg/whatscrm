
ALTER TABLE public.chatbots
  ADD COLUMN IF NOT EXISTS widget_config jsonb NOT NULL DEFAULT '{}'::jsonb;
