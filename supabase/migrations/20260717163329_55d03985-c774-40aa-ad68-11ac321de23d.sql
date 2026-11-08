
-- Templates
CREATE TABLE public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Internal Automation',
  icon text NOT NULL DEFAULT 'Workflow',
  tags text[] NOT NULL DEFAULT '{}',
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  is_featured boolean NOT NULL DEFAULT false,
  is_public_in_workspace boolean NOT NULL DEFAULT true,
  share_slug text UNIQUE,
  forked_from_template_id uuid REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wf_tpl_workspace ON public.workflow_templates(workspace_id, category);
CREATE INDEX idx_wf_tpl_featured ON public.workflow_templates(is_featured) WHERE is_featured;
CREATE INDEX idx_wf_tpl_owner ON public.workflow_templates(owner_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO authenticated;
GRANT ALL ON public.workflow_templates TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- Members can read: system templates (workspace_id null), workspace-public templates, or own drafts.
CREATE POLICY "wf_tpl read" ON public.workflow_templates FOR SELECT TO authenticated
USING (
  workspace_id IS NULL
  OR owner_user_id = auth.uid()
  OR (
    is_public_in_workspace = true
    AND workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  )
);

-- Any workspace member can create a template scoped to their workspace.
CREATE POLICY "wf_tpl insert" ON public.workflow_templates FOR INSERT TO authenticated
WITH CHECK (
  owner_user_id = auth.uid()
  AND workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

-- Owner can edit own; workspace admins/owners can edit workspace-public ones.
CREATE POLICY "wf_tpl update" ON public.workflow_templates FOR UPDATE TO authenticated
USING (
  owner_user_id = auth.uid()
  OR workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  )
)
WITH CHECK (
  owner_user_id = auth.uid()
  OR workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  )
);

CREATE POLICY "wf_tpl delete" ON public.workflow_templates FOR DELETE TO authenticated
USING (
  owner_user_id = auth.uid()
  OR workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  )
);

-- Favorites
CREATE TABLE public.workflow_template_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);
GRANT SELECT, INSERT, DELETE ON public.workflow_template_favorites TO authenticated;
GRANT ALL ON public.workflow_template_favorites TO service_role;
ALTER TABLE public.workflow_template_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_tpl_fav own" ON public.workflow_template_favorites FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Usage log (recently used)
CREATE TABLE public.workflow_template_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wf_tpl_usage_user ON public.workflow_template_usage(user_id, used_at DESC);
CREATE INDEX idx_wf_tpl_usage_tpl ON public.workflow_template_usage(template_id, used_at DESC);
GRANT SELECT, INSERT ON public.workflow_template_usage TO authenticated;
GRANT ALL ON public.workflow_template_usage TO service_role;
ALTER TABLE public.workflow_template_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_tpl_usage own" ON public.workflow_template_usage FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "wf_tpl_usage insert own" ON public.workflow_template_usage FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- updated_at trigger
CREATE TRIGGER trg_wf_tpl_updated BEFORE UPDATE ON public.workflow_templates
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_template_favorites;
