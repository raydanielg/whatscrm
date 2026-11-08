
-- Prompt settings (org + workspace level)
CREATE TABLE public.ai_prompt_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  org_prompt text,
  workspace_prompt text,
  default_tone text NOT NULL DEFAULT 'professional',
  default_length text NOT NULL DEFAULT 'medium',
  default_language text,
  default_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  fallback_message text NOT NULL DEFAULT 'I''m not sure I can help with that. Could you rephrase?',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_prompt_settings TO authenticated;
GRANT ALL ON public.ai_prompt_settings TO service_role;
ALTER TABLE public.ai_prompt_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompt_settings_workspace_members" ON public.ai_prompt_settings
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Conversations
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id uuid,
  title text NOT NULL DEFAULT 'New conversation',
  status text NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_workspace_idx ON public.ai_conversations(workspace_id, last_message_at DESC NULLS LAST);
CREATE INDEX ai_conversations_user_idx ON public.ai_conversations(user_id) WHERE user_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conversations_workspace_members" ON public.ai_conversations
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Messages
CREATE TABLE public.ai_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  tool_calls jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  provider text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  language text,
  detected_language text,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversation_messages_conv_idx ON public.ai_conversation_messages(conversation_id, created_at);
CREATE INDEX ai_conversation_messages_ws_idx ON public.ai_conversation_messages(workspace_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_messages TO authenticated;
GRANT ALL ON public.ai_conversation_messages TO service_role;
ALTER TABLE public.ai_conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conversation_messages_workspace_members" ON public.ai_conversation_messages
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Updated_at trigger (reuse existing helper if present, otherwise create)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER ai_prompt_settings_touch BEFORE UPDATE ON public.ai_prompt_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_conversations_touch BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
