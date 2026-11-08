
-- Extend crm_tags
ALTER TABLE public.crm_tags
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.crm_tags(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_smart boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS crm_tags_ws_idx ON public.crm_tags(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_tags_parent_idx ON public.crm_tags(parent_id);

-- Extend tag assignment entity types to include 'customer'
ALTER TABLE public.crm_tag_assignments DROP CONSTRAINT IF EXISTS crm_tag_assignments_entity_type_check;
ALTER TABLE public.crm_tag_assignments ADD CONSTRAINT crm_tag_assignments_entity_type_check
  CHECK (entity_type = ANY (ARRAY['contact','company','lead','customer','deal','task']));

-- Segments (saved filters / dynamic lists)
CREATE TABLE IF NOT EXISTS public.crm_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['contact','company','lead','customer','deal','task'])),
  name text NOT NULL,
  description text,
  color text DEFAULT '#6366f1',
  icon text,
  rules jsonb NOT NULL DEFAULT '{"operator":"AND","conditions":[]}'::jsonb,
  is_favorite boolean NOT NULL DEFAULT false,
  is_shared boolean NOT NULL DEFAULT true,
  is_dynamic boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, entity_type, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_segments TO authenticated;
GRANT ALL ON public.crm_segments TO service_role;

ALTER TABLE public.crm_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segments_select" ON public.crm_segments FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "segments_write" ON public.crm_segments FOR ALL
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS crm_segments_ws_entity_idx
  ON public.crm_segments(workspace_id, entity_type) WHERE deleted_at IS NULL;

CREATE TRIGGER crm_segments_updated_at BEFORE UPDATE ON public.crm_segments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
