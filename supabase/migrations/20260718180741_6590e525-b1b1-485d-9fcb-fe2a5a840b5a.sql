
CREATE TABLE public.ai_tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid,
  user_id uuid,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  success boolean NOT NULL DEFAULT true,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_tool_executions_ws_idx ON public.ai_tool_executions (workspace_id, created_at DESC);
CREATE INDEX ai_tool_executions_conv_idx ON public.ai_tool_executions (conversation_id, created_at DESC);

GRANT SELECT ON public.ai_tool_executions TO authenticated;
GRANT ALL ON public.ai_tool_executions TO service_role;

ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read ai_tool_executions"
  ON public.ai_tool_executions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ai_tool_executions.workspace_id
      AND wm.user_id = auth.uid()
  ));
