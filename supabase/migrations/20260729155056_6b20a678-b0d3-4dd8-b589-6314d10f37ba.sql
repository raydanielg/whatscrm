-- Active-membership helper (stricter than is_workspace_member: requires active status)
CREATE OR REPLACE FUNCTION public.is_active_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = _user_id
      AND wm.status = 'active'
  );
$$;

REVOKE ALL ON public.contact_lists FROM anon;
REVOKE ALL ON public.contact_list_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_list_members TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;
GRANT ALL ON public.contact_list_members TO service_role;

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;

-- contact_lists
DROP POLICY IF EXISTS "contact_lists ws access" ON public.contact_lists;
DROP POLICY IF EXISTS "contact_lists select" ON public.contact_lists;
DROP POLICY IF EXISTS "contact_lists insert" ON public.contact_lists;
DROP POLICY IF EXISTS "contact_lists update" ON public.contact_lists;
DROP POLICY IF EXISTS "contact_lists delete" ON public.contact_lists;

CREATE POLICY "contact_lists select" ON public.contact_lists
FOR SELECT TO authenticated
USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "contact_lists insert" ON public.contact_lists
FOR INSERT TO authenticated
WITH CHECK (
  public.is_active_workspace_member(workspace_id, auth.uid())
  AND (created_by IS NULL OR created_by = auth.uid())
  AND (
    segment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.crm_segments s
      WHERE s.id = segment_id AND s.workspace_id = contact_lists.workspace_id
    )
  )
);

CREATE POLICY "contact_lists update" ON public.contact_lists
FOR UPDATE TO authenticated
USING (public.is_active_workspace_member(workspace_id, auth.uid()))
WITH CHECK (
  public.is_active_workspace_member(workspace_id, auth.uid())
  AND (
    segment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.crm_segments s
      WHERE s.id = segment_id AND s.workspace_id = contact_lists.workspace_id
    )
  )
);

CREATE POLICY "contact_lists delete" ON public.contact_lists
FOR DELETE TO authenticated
USING (public.is_active_workspace_member(workspace_id, auth.uid()));

-- Prevent moving a list to another workspace
CREATE OR REPLACE FUNCTION public.prevent_contact_list_workspace_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'Cannot move a contact list to another workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_lists_lock_workspace ON public.contact_lists;
CREATE TRIGGER trg_contact_lists_lock_workspace
BEFORE UPDATE OF workspace_id ON public.contact_lists
FOR EACH ROW EXECUTE FUNCTION public.prevent_contact_list_workspace_change();

-- contact_list_members
DROP POLICY IF EXISTS "contact_list_members ws access" ON public.contact_list_members;
DROP POLICY IF EXISTS "contact_list_members select" ON public.contact_list_members;
DROP POLICY IF EXISTS "contact_list_members insert" ON public.contact_list_members;
DROP POLICY IF EXISTS "contact_list_members update" ON public.contact_list_members;
DROP POLICY IF EXISTS "contact_list_members delete" ON public.contact_list_members;

CREATE POLICY "contact_list_members select" ON public.contact_list_members
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contact_lists cl
    WHERE cl.id = contact_list_members.list_id
      AND public.is_active_workspace_member(cl.workspace_id, auth.uid())
  )
);

CREATE POLICY "contact_list_members insert" ON public.contact_list_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
      FROM public.contact_lists cl
      JOIN public.contacts c ON c.id = contact_list_members.contact_id
     WHERE cl.id = contact_list_members.list_id
       AND c.workspace_id = cl.workspace_id
       AND public.is_active_workspace_member(cl.workspace_id, auth.uid())
  )
  AND (added_by IS NULL OR added_by = auth.uid())
);

CREATE POLICY "contact_list_members update" ON public.contact_list_members
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contact_lists cl
    WHERE cl.id = contact_list_members.list_id
      AND public.is_active_workspace_member(cl.workspace_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
      FROM public.contact_lists cl
      JOIN public.contacts c ON c.id = contact_list_members.contact_id
     WHERE cl.id = contact_list_members.list_id
       AND c.workspace_id = cl.workspace_id
       AND public.is_active_workspace_member(cl.workspace_id, auth.uid())
  )
);

CREATE POLICY "contact_list_members delete" ON public.contact_list_members
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contact_lists cl
    WHERE cl.id = contact_list_members.list_id
      AND public.is_active_workspace_member(cl.workspace_id, auth.uid())
  )
);