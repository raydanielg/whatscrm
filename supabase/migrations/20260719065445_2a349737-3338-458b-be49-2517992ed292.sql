
-- Subtasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON public.tasks(parent_task_id);

-- Ticket-to-ticket linking
CREATE TABLE IF NOT EXISTS public.ticket_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  linked_ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'related' CHECK (link_type IN ('related','duplicate','blocks','blocked_by','causes','caused_by')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, linked_ticket_id, link_type)
);
CREATE INDEX IF NOT EXISTS ticket_links_ticket_idx ON public.ticket_links(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_links_workspace_idx ON public.ticket_links(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_links TO authenticated;
GRANT ALL ON public.ticket_links TO service_role;
ALTER TABLE public.ticket_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_links workspace access" ON public.ticket_links
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- CRM entity links for tickets (deal, company, contact, order)
CREATE TABLE IF NOT EXISTS public.ticket_crm_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('deal','company','contact','order','invoice','quote')),
  entity_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS ticket_crm_links_ticket_idx ON public.ticket_crm_links(ticket_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_crm_links TO authenticated;
GRANT ALL ON public.ticket_crm_links TO service_role;
ALTER TABLE public.ticket_crm_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_crm_links workspace access" ON public.ticket_crm_links
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- AI suggestions cache (KB + next-best-action)
CREATE TABLE IF NOT EXISTS public.ticket_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('kb_article','next_action','summary','sentiment')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_ai_suggestions_ticket_idx ON public.ticket_ai_suggestions(ticket_id, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_ai_suggestions TO authenticated;
GRANT ALL ON public.ticket_ai_suggestions TO service_role;
ALTER TABLE public.ticket_ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_ai_suggestions workspace access" ON public.ticket_ai_suggestions
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
