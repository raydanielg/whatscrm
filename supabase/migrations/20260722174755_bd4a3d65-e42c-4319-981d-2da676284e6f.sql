-- Per-user last-read watermark per conversation, so unread state is accurate
-- across devices and browser sessions for portal & agent users.
CREATE TABLE IF NOT EXISTS public.conversation_read_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS conversation_read_state_conv_idx
  ON public.conversation_read_state (conversation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_read_state TO authenticated;
GRANT ALL ON public.conversation_read_state TO service_role;

ALTER TABLE public.conversation_read_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own read-state"
  ON public.conversation_read_state
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert their own read-state"
  ON public.conversation_read_state
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own read-state"
  ON public.conversation_read_state
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own read-state"
  ON public.conversation_read_state
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_conversation_read_state()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_read_state_touch ON public.conversation_read_state;
CREATE TRIGGER conversation_read_state_touch
  BEFORE UPDATE ON public.conversation_read_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_read_state();

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_read_state;