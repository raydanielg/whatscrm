
-- Extend chatbots with training fields
ALTER TABLE public.chatbots
  ADD COLUMN IF NOT EXISTS personality text,
  ADD COLUMN IF NOT EXISTS tone text DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS greeting text,
  ADD COLUMN IF NOT EXISTS escalation_prompt text,
  ADD COLUMN IF NOT EXISTS organization_prompt text,
  ADD COLUMN IF NOT EXISTS department_prompt text,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- Prompt library with versioning + sharing
CREATE TABLE IF NOT EXISTS public.chatbot_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chatbot_id uuid REFERENCES public.chatbots(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.chatbot_prompts(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'system',
  content text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  language text DEFAULT 'en',
  is_shared boolean NOT NULL DEFAULT false,
  is_template boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  usage_count int NOT NULL DEFAULT 0,
  avg_rating numeric(3,2),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_prompts_category_check CHECK (category IN
    ('system','organization','department','personality','tone','greeting','fallback','escalation','custom'))
);

CREATE INDEX IF NOT EXISTS idx_chatbot_prompts_ws ON public.chatbot_prompts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_prompts_bot ON public.chatbot_prompts(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_prompts_parent ON public.chatbot_prompts(parent_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_prompts_category ON public.chatbot_prompts(workspace_id, category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_prompts TO authenticated;
GRANT ALL ON public.chatbot_prompts TO service_role;
ALTER TABLE public.chatbot_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read chatbot_prompts"
  ON public.chatbot_prompts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_prompts.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "workspace members write chatbot_prompts"
  ON public.chatbot_prompts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_prompts.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "workspace members update chatbot_prompts"
  ON public.chatbot_prompts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_prompts.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "workspace members delete chatbot_prompts"
  ON public.chatbot_prompts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_prompts.workspace_id AND wm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.chatbot_prompts_touch() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_chatbot_prompts_touch ON public.chatbot_prompts;
CREATE TRIGGER trg_chatbot_prompts_touch
  BEFORE UPDATE ON public.chatbot_prompts
  FOR EACH ROW EXECUTE FUNCTION public.chatbot_prompts_touch();

-- Prompt tests
CREATE TABLE IF NOT EXISTS public.chatbot_prompt_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES public.chatbot_prompts(id) ON DELETE CASCADE,
  chatbot_id uuid REFERENCES public.chatbots(id) ON DELETE CASCADE,
  input text NOT NULL,
  output text,
  model text,
  latency_ms int,
  tokens_in int,
  tokens_out int,
  rating int,
  notes text,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_prompt_tests_rating_check CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
);

CREATE INDEX IF NOT EXISTS idx_chatbot_prompt_tests_ws ON public.chatbot_prompt_tests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_prompt_tests_prompt ON public.chatbot_prompt_tests(prompt_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_prompt_tests_bot ON public.chatbot_prompt_tests(chatbot_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_prompt_tests TO authenticated;
GRANT ALL ON public.chatbot_prompt_tests TO service_role;
ALTER TABLE public.chatbot_prompt_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read chatbot_prompt_tests"
  ON public.chatbot_prompt_tests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_prompt_tests.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "workspace members write chatbot_prompt_tests"
  ON public.chatbot_prompt_tests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_prompt_tests.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "workspace members update chatbot_prompt_tests"
  ON public.chatbot_prompt_tests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_prompt_tests.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "workspace members delete chatbot_prompt_tests"
  ON public.chatbot_prompt_tests FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_prompt_tests.workspace_id AND wm.user_id = auth.uid()));
