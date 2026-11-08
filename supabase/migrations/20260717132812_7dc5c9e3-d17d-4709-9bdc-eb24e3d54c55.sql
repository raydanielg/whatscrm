
CREATE TABLE public.conversation_intelligence (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  summary text,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  intent text,
  sentiment text CHECK (sentiment IN ('positive','neutral','negative','mixed')),
  sentiment_score numeric,
  emotion text,
  urgency text CHECK (urgency IN ('low','medium','high','critical')),
  priority text CHECK (priority IN ('low','medium','high','urgent')),
  satisfaction_score numeric,
  satisfaction_prediction text,
  risk_score numeric,
  risk_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_spam boolean NOT NULL DEFAULT false,
  spam_score numeric,
  category text,
  topics text[] NOT NULL DEFAULT '{}',
  language text,
  model text,
  provider_kind text,
  tokens_used int NOT NULL DEFAULT 0,
  messages_analyzed int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  needs_reanalysis boolean NOT NULL DEFAULT false,
  analyzed_at timestamptz,
  search_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conv_intel_workspace_idx ON public.conversation_intelligence(workspace_id);
CREATE INDEX conv_intel_search_idx ON public.conversation_intelligence
  USING GIN (to_tsvector('simple', coalesce(search_text, '')));
CREATE INDEX conv_intel_search_trgm_idx ON public.conversation_intelligence
  USING GIN (search_text gin_trgm_ops);
CREATE INDEX conv_intel_topics_idx ON public.conversation_intelligence USING GIN (topics);
CREATE INDEX conv_intel_needs_reanalysis_idx ON public.conversation_intelligence(workspace_id, needs_reanalysis) WHERE needs_reanalysis = true;
CREATE INDEX conv_intel_category_idx ON public.conversation_intelligence(workspace_id, category);
CREATE INDEX conv_intel_urgency_idx ON public.conversation_intelligence(workspace_id, urgency);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_intelligence TO authenticated;
GRANT ALL ON public.conversation_intelligence TO service_role;

ALTER TABLE public.conversation_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read intel"
  ON public.conversation_intelligence FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace members manage intel"
  ON public.conversation_intelligence FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER conv_intel_updated_at
  BEFORE UPDATE ON public.conversation_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Workspace-level daily/weekly summaries
CREATE TABLE public.workspace_ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('daily','weekly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  summary text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  provider_kind text,
  tokens_used int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, period, period_start)
);

CREATE INDEX ws_ai_summary_search_idx ON public.workspace_ai_summaries
  USING GIN (to_tsvector('simple', summary));
CREATE INDEX ws_ai_summary_ws_idx ON public.workspace_ai_summaries(workspace_id, period, period_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_ai_summaries TO authenticated;
GRANT ALL ON public.workspace_ai_summaries TO service_role;

ALTER TABLE public.workspace_ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read summaries"
  ON public.workspace_ai_summaries FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace members manage summaries"
  ON public.workspace_ai_summaries FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Trigger to mark conversation for re-analysis on new (non-internal) messages
CREATE OR REPLACE FUNCTION public.tg_mark_intel_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ws uuid;
BEGIN
  IF NEW.is_internal THEN RETURN NEW; END IF;
  SELECT workspace_id INTO _ws FROM public.conversations WHERE id = NEW.conversation_id;
  IF _ws IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.conversation_intelligence(conversation_id, workspace_id, needs_reanalysis, last_message_at)
  VALUES (NEW.conversation_id, _ws, true, NEW.created_at)
  ON CONFLICT (conversation_id) DO UPDATE
    SET needs_reanalysis = true,
        last_message_at = GREATEST(coalesce(public.conversation_intelligence.last_message_at, NEW.created_at), NEW.created_at),
        updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER messages_mark_intel_stale
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_mark_intel_stale();
