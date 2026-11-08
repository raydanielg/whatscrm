-- Tasks: allow conversation entities, and tighten update/delete/insert RLS.
-- Helpers used (defined in 20260717075830_*.sql, EXECUTE granted to authenticated):
--   public.is_workspace_member(workspace_id uuid, user_id uuid)
--   public.has_workspace_role(workspace_id uuid, user_id uuid, roles public.workspace_role[])

-- (a) Allow entity_type = 'conversation' on tasks.
-- The original inline CHECK was unnamed, so Postgres auto-named it tasks_entity_type_check.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_entity_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_entity_type_check
  CHECK (entity_type IN ('contact','company','lead','deal','conversation') OR entity_type IS NULL);

-- (b) Update and delete: only the creator, the assignee, or a workspace owner/admin.
-- The WITH CHECK on update still requires the row to stay in a workspace the caller belongs to.
DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR auth.uid() = assigned_to
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])
  )
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR auth.uid() = assigned_to
    OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])
  );

-- (c) Insert: must be a workspace member, and created_by (if set) must be the caller.
-- tasks_select is unchanged.
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );
