
CREATE TABLE public.chatbot_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  version INT NOT NULL,
  flow JSONB NOT NULL,
  label TEXT,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chatbot_id, version)
);
CREATE INDEX idx_cfv_bot ON public.chatbot_flow_versions(chatbot_id, version DESC);
CREATE INDEX idx_cfv_ws ON public.chatbot_flow_versions(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_flow_versions TO authenticated;
GRANT ALL ON public.chatbot_flow_versions TO service_role;

ALTER TABLE public.chatbot_flow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read flow versions"
  ON public.chatbot_flow_versions FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members write flow versions"
  ON public.chatbot_flow_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members update flow versions"
  ON public.chatbot_flow_versions FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members delete flow versions"
  ON public.chatbot_flow_versions FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
