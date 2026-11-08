
ALTER TABLE public.chatbot_sessions
  ADD COLUMN IF NOT EXISTS ai_language text,
  ADD COLUMN IF NOT EXISTS ai_sentiment text,
  ADD COLUMN IF NOT EXISTS ai_sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS ai_intent text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_topics jsonb,
  ADD COLUMN IF NOT EXISTS ai_lead_score integer,
  ADD COLUMN IF NOT EXISTS ai_lead_stage text,
  ADD COLUMN IF NOT EXISTS ai_recommendations jsonb,
  ADD COLUMN IF NOT EXISTS ai_escalation_reason text,
  ADD COLUMN IF NOT EXISTS ai_updated_at timestamptz;

ALTER TABLE public.chatbot_messages
  ADD COLUMN IF NOT EXISTS ai_intent text,
  ADD COLUMN IF NOT EXISTS ai_sentiment text,
  ADD COLUMN IF NOT EXISTS ai_language text,
  ADD COLUMN IF NOT EXISTS ai_kb_hits jsonb;

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_ai_intent ON public.chatbot_sessions(ai_intent) WHERE ai_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_ai_lead_score ON public.chatbot_sessions(ai_lead_score DESC NULLS LAST);
