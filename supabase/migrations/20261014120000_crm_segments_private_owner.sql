-- Keep segment ownership tied to the authenticated creator, and honor
-- "Shared with workspace" for reads and writes.
UPDATE public.crm_segments AS segment
SET created_by = workspace.owner_id
FROM public.workspaces AS workspace
WHERE segment.workspace_id = workspace.id
  AND segment.created_by IS NULL;

CREATE OR REPLACE FUNCTION public.crm_segments_stamp_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_segments_stamp_owner ON public.crm_segments;
CREATE TRIGGER crm_segments_stamp_owner
BEFORE INSERT OR UPDATE ON public.crm_segments
FOR EACH ROW EXECUTE FUNCTION public.crm_segments_stamp_owner();

DROP POLICY IF EXISTS "segments_select" ON public.crm_segments;
DROP POLICY IF EXISTS "segments_write" ON public.crm_segments;

CREATE POLICY "segments_select" ON public.crm_segments
FOR SELECT TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (is_shared OR created_by = auth.uid())
);

CREATE POLICY "segments_insert" ON public.crm_segments
FOR INSERT TO authenticated
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "segments_update" ON public.crm_segments
FOR UPDATE TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (is_shared OR created_by = auth.uid())
)
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (is_shared OR created_by = auth.uid())
);

CREATE POLICY "segments_delete" ON public.crm_segments
FOR DELETE TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (is_shared OR created_by = auth.uid())
);

-- Soft-deleted names should be reusable when creating a replacement.
ALTER TABLE public.crm_tags DROP CONSTRAINT IF EXISTS crm_tags_workspace_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS crm_tags_active_name_unique
ON public.crm_tags (workspace_id, name) WHERE deleted_at IS NULL;

ALTER TABLE public.crm_segments DROP CONSTRAINT IF EXISTS crm_segments_workspace_id_entity_type_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS crm_segments_active_name_unique
ON public.crm_segments (workspace_id, entity_type, name) WHERE deleted_at IS NULL;
