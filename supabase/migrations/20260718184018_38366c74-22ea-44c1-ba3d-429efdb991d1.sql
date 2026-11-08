
CREATE TABLE IF NOT EXISTS public.livechat_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  chatbot_id uuid REFERENCES public.chatbots(id) ON DELETE SET NULL,
  display_name text,
  email text,
  phone text,
  country text,
  region text,
  city text,
  timezone text,
  language text,
  user_agent text,
  device text,
  browser text,
  os text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  visits_count int NOT NULL DEFAULT 1,
  page_views   int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(workspace_id, visitor_key)
);
CREATE INDEX IF NOT EXISTS idx_livechat_visitors_workspace ON public.livechat_visitors(workspace_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_livechat_visitors_contact   ON public.livechat_visitors(contact_id) WHERE contact_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.livechat_visitors TO authenticated;
GRANT ALL ON public.livechat_visitors TO service_role;
ALTER TABLE public.livechat_visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "livechat_visitors by workspace" ON public.livechat_visitors FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.livechat_visitor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES public.livechat_visitors(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.chatbot_sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_name text,
  url  text,
  referrer text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_livechat_events_visitor ON public.livechat_visitor_events(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_livechat_events_workspace ON public.livechat_visitor_events(workspace_id, created_at DESC);
GRANT SELECT ON public.livechat_visitor_events TO authenticated;
GRANT ALL ON public.livechat_visitor_events TO service_role;
ALTER TABLE public.livechat_visitor_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "livechat_events read by workspace" ON public.livechat_visitor_events FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.livechat_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  match_pages text[] NOT NULL DEFAULT '{}',
  match_keywords text[] NOT NULL DEFAULT '{}',
  match_country text[] NOT NULL DEFAULT '{}',
  match_business_hours boolean,
  route_to text NOT NULL DEFAULT 'ai',
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  chatbot_id uuid REFERENCES public.chatbots(id) ON DELETE SET NULL,
  auto_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_livechat_rules_workspace ON public.livechat_routing_rules(workspace_id, priority);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.livechat_routing_rules TO authenticated;
GRANT ALL ON public.livechat_routing_rules TO service_role;
ALTER TABLE public.livechat_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "livechat_routing_rules by workspace" ON public.livechat_routing_rules FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

ALTER TABLE public.chatbot_sessions
  ADD COLUMN IF NOT EXISTS visitor_id uuid REFERENCES public.livechat_visitors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_to text,
  ADD COLUMN IF NOT EXISTS routed_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_conversation ON public.chatbot_sessions(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_visitor ON public.chatbot_sessions(visitor_id) WHERE visitor_id IS NOT NULL;

ALTER TABLE public.livechat_visitors REPLICA IDENTITY FULL;
ALTER TABLE public.livechat_visitor_events REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.livechat_visitors; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.livechat_visitor_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
