
CREATE TABLE public.chat_widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  chatbot_id UUID NULL REFERENCES public.chatbots(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  routing_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_domains TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_widgets_workspace_idx ON public.chat_widgets(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_widgets TO authenticated;
GRANT SELECT ON public.chat_widgets TO anon;
GRANT ALL ON public.chat_widgets TO service_role;

ALTER TABLE public.chat_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage widgets in workspace"
  ON public.chat_widgets FOR ALL
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Public can read active widgets"
  ON public.chat_widgets FOR SELECT
  TO anon
  USING (is_active = true);

CREATE TRIGGER chat_widgets_updated_at
  BEFORE UPDATE ON public.chat_widgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Session/analytics events for embedded widgets
CREATE TABLE public.chat_widget_events (
  id BIGSERIAL PRIMARY KEY,
  widget_id UUID NOT NULL REFERENCES public.chat_widgets(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT NULL,
  url TEXT NULL,
  referrer TEXT NULL,
  user_agent TEXT NULL,
  country TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_widget_events_widget_idx ON public.chat_widget_events(widget_id, created_at DESC);
CREATE INDEX chat_widget_events_workspace_idx ON public.chat_widget_events(workspace_id, created_at DESC);

GRANT SELECT ON public.chat_widget_events TO authenticated;
GRANT ALL ON public.chat_widget_events TO service_role;

ALTER TABLE public.chat_widget_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read widget events in workspace"
  ON public.chat_widget_events FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
