CREATE TABLE IF NOT EXISTS public.chatbots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  avatar_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  language text DEFAULT 'en',
  provider_id uuid,
  model text,
  temperature numeric(3,2) DEFAULT 0.4,
  max_tokens integer DEFAULT 800,
  system_prompt text DEFAULT 'You are a helpful AI assistant. Answer briefly using the provided knowledge base context when available.',
  welcome_message text DEFAULT 'Hi! How can I help you today?',
  fallback_message text DEFAULT 'Sorry, I did not understand that. Would you like to talk to a human?',
  rag_enabled boolean NOT NULL DEFAULT true,
  rag_min_similarity numeric(3,2) DEFAULT 0.25,
  rag_match_count integer DEFAULT 5,
  handoff_enabled boolean NOT NULL DEFAULT true,
  handoff_keywords text[] DEFAULT ARRAY['agent','human','support']::text[],
  flow jsonb DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  total_sessions integer NOT NULL DEFAULT 0,
  total_messages integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbots_ws ON public.chatbots(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbots TO authenticated;
GRANT ALL ON public.chatbots TO service_role;
ALTER TABLE public.chatbots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatbots members read" ON public.chatbots FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbots.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "chatbots editors write" ON public.chatbots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbots.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbots.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));

CREATE TABLE IF NOT EXISTS public.chatbot_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chatbot_id uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','instagram','messenger','telegram','livechat','web','sms','email')),
  channel_account_id text,
  enabled boolean NOT NULL DEFAULT true,
  business_hours_only boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chatbot_id, channel, channel_account_id)
);
CREATE INDEX IF NOT EXISTS idx_chatbot_deploy_ws ON public.chatbot_deployments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_deploy_bot ON public.chatbot_deployments(chatbot_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_deployments TO authenticated;
GRANT ALL ON public.chatbot_deployments TO service_role;
ALTER TABLE public.chatbot_deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatbot_deploy members read" ON public.chatbot_deployments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_deployments.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "chatbot_deploy editors write" ON public.chatbot_deployments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_deployments.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_deployments.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));

CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chatbot_id uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_id text,
  contact_id uuid,
  conversation_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','handed_off','closed')),
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  handoff_reason text,
  handed_off_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handed_off_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_sess_ws ON public.chatbot_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sess_bot ON public.chatbot_sessions(chatbot_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_sessions TO authenticated;
GRANT ALL ON public.chatbot_sessions TO service_role;
ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatbot_sess members read" ON public.chatbot_sessions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_sessions.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "chatbot_sess members write" ON public.chatbot_sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_sessions.workspace_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_sessions.workspace_id AND m.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.chatbot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.chatbot_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content text NOT NULL,
  citations jsonb DEFAULT '[]'::jsonb,
  tokens_prompt integer,
  tokens_completion integer,
  latency_ms integer,
  provider_kind text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_sess ON public.chatbot_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_ws ON public.chatbot_messages(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_messages TO authenticated;
GRANT ALL ON public.chatbot_messages TO service_role;
ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatbot_msg members read" ON public.chatbot_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_messages.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "chatbot_msg members write" ON public.chatbot_messages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_messages.workspace_id AND m.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.chatbot_kb_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chatbot_id uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  category_id uuid,
  article_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (category_id IS NOT NULL OR article_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_chatbot_kb_bot ON public.chatbot_kb_sources(chatbot_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_kb_sources TO authenticated;
GRANT ALL ON public.chatbot_kb_sources TO service_role;
ALTER TABLE public.chatbot_kb_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatbot_kb members read" ON public.chatbot_kb_sources FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_kb_sources.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "chatbot_kb editors write" ON public.chatbot_kb_sources FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_kb_sources.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = chatbot_kb_sources.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));

CREATE OR REPLACE FUNCTION public.tg_touch_chatbots() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_touch_chatbots ON public.chatbots;
CREATE TRIGGER trg_touch_chatbots BEFORE UPDATE ON public.chatbots FOR EACH ROW EXECUTE FUNCTION public.tg_touch_chatbots();