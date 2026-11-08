-- Apply after project management. Automated client updates are explicit opt-in
-- and are limited to a single email conversation per rule.
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_workspace_id_id_unique UNIQUE (workspace_id, id);

CREATE TABLE public.pm_client_update_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence = 'weekly'),
  day_of_week integer NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6),
  hour_utc integer NOT NULL DEFAULT 9 CHECK (hour_utc BETWEEN 0 AND 23),
  include_tasks boolean NOT NULL DEFAULT false,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_client_update_project_fk FOREIGN KEY (workspace_id, project_id)
    REFERENCES public.pm_projects(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT pm_client_update_conversation_fk FOREIGN KEY (workspace_id, conversation_id)
    REFERENCES public.conversations(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT pm_client_update_one_per_thread UNIQUE (workspace_id, conversation_id)
);
CREATE INDEX pm_client_update_due_idx ON public.pm_client_update_rules(enabled, day_of_week, hour_utc)
  WHERE enabled = true;
CREATE TRIGGER pm_client_update_rules_updated_at BEFORE UPDATE ON public.pm_client_update_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pm_client_update_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pm_client_update_rules FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.pm_client_update_rules TO authenticated;
GRANT UPDATE (project_id, enabled, day_of_week, hour_utc, include_tasks)
  ON public.pm_client_update_rules TO authenticated;
GRANT ALL ON public.pm_client_update_rules TO service_role;

CREATE POLICY pm_client_update_select ON public.pm_client_update_rules FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, (SELECT auth.uid())));
CREATE POLICY pm_client_update_insert ON public.pm_client_update_rules FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND pm_internal.can_manage_project(project_id, workspace_id)
    AND EXISTS (SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.workspace_id = workspace_id AND c.channel = 'email')
  );
CREATE POLICY pm_client_update_update ON public.pm_client_update_rules FOR UPDATE TO authenticated
  USING (pm_internal.can_manage_project(project_id, workspace_id))
  WITH CHECK (
    pm_internal.can_manage_project(project_id, workspace_id)
    AND EXISTS (SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.workspace_id = workspace_id AND c.channel = 'email')
  );
CREATE POLICY pm_client_update_delete ON public.pm_client_update_rules FOR DELETE TO authenticated
  USING (pm_internal.can_manage_project(project_id, workspace_id));

CREATE TABLE public.pm_client_update_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.pm_client_update_rules(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'failed', 'uncertain')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_client_update_slot_unique UNIQUE (rule_id, slot_date)
);
CREATE TRIGGER pm_client_update_deliveries_updated_at BEFORE UPDATE ON public.pm_client_update_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.pm_client_update_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pm_client_update_deliveries FROM anon, authenticated;
GRANT ALL ON public.pm_client_update_deliveries TO service_role;
