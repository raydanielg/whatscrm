
-- SUPPORT QUEUES
CREATE TABLE public.support_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#A4161A',
  icon text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  inbox_id uuid REFERENCES public.inboxes(id) ON DELETE SET NULL,
  strategy text NOT NULL DEFAULT 'round_robin', -- round_robin | least_busy | skill | vip | language | manual
  required_skills text[] DEFAULT '{}',
  required_languages text[] DEFAULT '{}',
  vip_only boolean DEFAULT false,
  priority int DEFAULT 0,
  round_robin_cursor int DEFAULT 0,
  max_open_per_agent int DEFAULT 10,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_queues TO authenticated;
GRANT ALL ON public.support_queues TO service_role;
ALTER TABLE public.support_queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queues_workspace_read" ON public.support_queues FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "queues_workspace_write" ON public.support_queues FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX idx_support_queues_workspace ON public.support_queues(workspace_id) WHERE is_active;

-- AGENT SKILLS / LANGUAGES / VIP
CREATE TABLE public.agent_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  skills text[] DEFAULT '{}',
  languages text[] DEFAULT '{}',
  handles_vip boolean DEFAULT false,
  max_concurrent int DEFAULT 10,
  is_available boolean DEFAULT true,
  current_load int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_skills TO authenticated;
GRANT ALL ON public.agent_skills TO service_role;
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_skills_workspace" ON public.agent_skills FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX idx_agent_skills_workspace ON public.agent_skills(workspace_id, is_available);

-- QUEUE TICKETS
CREATE TABLE public.queue_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  queue_id uuid NOT NULL REFERENCES public.support_queues(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting', -- waiting | assigned | resolved
  assigned_to uuid,
  entered_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  UNIQUE(queue_id, ticket_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_tickets TO authenticated;
GRANT ALL ON public.queue_tickets TO service_role;
ALTER TABLE public.queue_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue_tickets_workspace" ON public.queue_tickets FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX idx_queue_tickets_queue ON public.queue_tickets(queue_id, status);

-- TICKET MENTIONS
CREATE TABLE public.ticket_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  note_id uuid,
  mentioned_user_id uuid NOT NULL,
  mentioned_by uuid NOT NULL,
  content text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_mentions TO authenticated;
GRANT ALL ON public.ticket_mentions TO service_role;
ALTER TABLE public.ticket_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentions_read_own_or_workspace" ON public.ticket_mentions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "mentions_insert_workspace" ON public.ticket_mentions FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "mentions_update_own" ON public.ticket_mentions FOR UPDATE TO authenticated
  USING (mentioned_user_id = auth.uid());
CREATE INDEX idx_ticket_mentions_user ON public.ticket_mentions(mentioned_user_id, read_at);

-- ASSIGNMENT RULE EXTENSIONS
ALTER TABLE public.assignment_rules
  ADD COLUMN IF NOT EXISTS queue_id uuid REFERENCES public.support_queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_skills text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_languages text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vip_only boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority int DEFAULT 0;

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_queues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_skills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_mentions;

-- updated_at triggers
CREATE TRIGGER trg_support_queues_updated BEFORE UPDATE ON public.support_queues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agent_skills_updated BEFORE UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
