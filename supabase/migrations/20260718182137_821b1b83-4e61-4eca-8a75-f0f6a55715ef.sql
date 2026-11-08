
CREATE TABLE public.chatbot_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Customer Support',
  icon TEXT NOT NULL DEFAULT 'Bot',
  tags TEXT[] NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_public_in_workspace BOOLEAN NOT NULL DEFAULT true,
  is_community BOOLEAN NOT NULL DEFAULT false,
  share_slug TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  forked_from_template_id UUID REFERENCES public.chatbot_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chatbot_templates_workspace_idx ON public.chatbot_templates(workspace_id);
CREATE INDEX chatbot_templates_category_idx ON public.chatbot_templates(category);
CREATE INDEX chatbot_templates_featured_idx ON public.chatbot_templates(is_featured) WHERE is_featured = true;
CREATE INDEX chatbot_templates_community_idx ON public.chatbot_templates(is_community) WHERE is_community = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_templates TO authenticated;
GRANT ALL ON public.chatbot_templates TO service_role;
ALTER TABLE public.chatbot_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View templates in workspace or community"
ON public.chatbot_templates FOR SELECT TO authenticated
USING (
  is_community = true
  OR owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_templates.workspace_id AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "Owners insert templates"
ON public.chatbot_templates FOR INSERT TO authenticated
WITH CHECK (
  owner_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = chatbot_templates.workspace_id AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "Owners update templates"
ON public.chatbot_templates FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owners delete templates"
ON public.chatbot_templates FOR DELETE TO authenticated
USING (owner_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER chatbot_templates_updated_at BEFORE UPDATE ON public.chatbot_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Favorites
CREATE TABLE public.chatbot_template_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.chatbot_templates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_template_favorites TO authenticated;
GRANT ALL ON public.chatbot_template_favorites TO service_role;
ALTER TABLE public.chatbot_template_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own favorites" ON public.chatbot_template_favorites FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Versions
CREATE TABLE public.chatbot_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.chatbot_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  changelog TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
CREATE INDEX chatbot_template_versions_template_idx ON public.chatbot_template_versions(template_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_template_versions TO authenticated;
GRANT ALL ON public.chatbot_template_versions TO service_role;
ALTER TABLE public.chatbot_template_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View versions if can view template" ON public.chatbot_template_versions
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.chatbot_templates t WHERE t.id = template_id));
CREATE POLICY "Template owners manage versions" ON public.chatbot_template_versions
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.chatbot_templates t WHERE t.id = template_id AND t.owner_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.chatbot_templates t WHERE t.id = template_id AND t.owner_user_id = auth.uid()));

-- Usage
CREATE TABLE public.chatbot_template_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.chatbot_templates(id) ON DELETE CASCADE,
  action TEXT NOT NULL DEFAULT 'clone',
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chatbot_template_usage_user_idx ON public.chatbot_template_usage(user_id, used_at DESC);
CREATE INDEX chatbot_template_usage_template_idx ON public.chatbot_template_usage(template_id);
GRANT SELECT, INSERT ON public.chatbot_template_usage TO authenticated;
GRANT ALL ON public.chatbot_template_usage TO service_role;
ALTER TABLE public.chatbot_template_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own usage" ON public.chatbot_template_usage FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users insert own usage" ON public.chatbot_template_usage FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
