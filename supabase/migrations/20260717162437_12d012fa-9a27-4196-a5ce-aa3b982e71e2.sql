
CREATE TYPE public.workflow_variable_scope AS ENUM ('global','workflow','environment','contact','deal','conversation','organization','custom');

CREATE TABLE public.workflow_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope public.workflow_variable_scope NOT NULL,
  automation_id UUID REFERENCES public.automations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_type TEXT NOT NULL DEFAULT 'string',
  description TEXT,
  is_secret BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflow_variables_key_chk CHECK (key ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'),
  CONSTRAINT workflow_variables_scope_ref_chk CHECK (
    (scope = 'workflow' AND automation_id IS NOT NULL) OR
    (scope <> 'workflow' AND automation_id IS NULL)
  )
);

CREATE UNIQUE INDEX workflow_variables_unique_global ON public.workflow_variables (workspace_id, scope, key)
  WHERE automation_id IS NULL;
CREATE UNIQUE INDEX workflow_variables_unique_workflow ON public.workflow_variables (workspace_id, automation_id, key)
  WHERE automation_id IS NOT NULL;
CREATE INDEX workflow_variables_ws_scope_idx ON public.workflow_variables (workspace_id, scope);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_variables TO authenticated;
GRANT ALL ON public.workflow_variables TO service_role;

ALTER TABLE public.workflow_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_variables select if member" ON public.workflow_variables
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workflow_variables write if member" ON public.workflow_variables
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.workflow_variables_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER workflow_variables_touch BEFORE UPDATE ON public.workflow_variables
  FOR EACH ROW EXECUTE FUNCTION public.workflow_variables_touch();
