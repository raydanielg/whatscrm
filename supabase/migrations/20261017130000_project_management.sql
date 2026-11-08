-- Dedicated project management data. Existing CRM tasks remain independent.
-- The Supabase CLI is not installed in this checkout, so this migration follows
-- the repository's YYYYMMDDHHMMSS_name.sql convention.

CREATE TABLE public.pm_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  description text,
  status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'archived')),
  color text NOT NULL DEFAULT '#075E54' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  start_date date,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_projects_dates_check CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  CONSTRAINT pm_projects_workspace_id_id_unique UNIQUE (workspace_id, id)
);

CREATE TABLE public.pm_project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'member', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_project_members_project_fk FOREIGN KEY (workspace_id, project_id)
    REFERENCES public.pm_projects(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT pm_project_members_project_user_unique UNIQUE (project_id, user_id)
);

CREATE TABLE public.pm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  description text,
  status text NOT NULL DEFAULT 'backlog'
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  position double precision NOT NULL DEFAULT 0 CHECK (position >= 0),
  due_date date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_tasks_project_fk FOREIGN KEY (workspace_id, project_id)
    REFERENCES public.pm_projects(workspace_id, id) ON DELETE CASCADE,
  -- PostgreSQL 15+ column-list SET NULL preserves project_id on removal.
  CONSTRAINT pm_tasks_assignee_member_fk FOREIGN KEY (project_id, assignee_id)
    REFERENCES public.pm_project_members(project_id, user_id) ON DELETE SET NULL (assignee_id)
);

CREATE INDEX pm_projects_workspace_status_idx ON public.pm_projects(workspace_id, status, created_at DESC);
CREATE INDEX pm_project_members_user_idx ON public.pm_project_members(workspace_id, user_id);
CREATE INDEX pm_project_members_project_idx ON public.pm_project_members(project_id, role);
CREATE INDEX pm_tasks_board_idx ON public.pm_tasks(project_id, status, position, created_at);
CREATE INDEX pm_tasks_workspace_assignee_idx ON public.pm_tasks(workspace_id, assignee_id);
CREATE INDEX pm_tasks_workspace_due_idx ON public.pm_tasks(workspace_id, due_date);

ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pm_projects, public.pm_project_members, public.pm_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_projects, public.pm_project_members, public.pm_tasks TO authenticated;
GRANT ALL ON public.pm_projects, public.pm_project_members, public.pm_tasks TO service_role;

-- Kept outside the exposed public schema to avoid recursive RLS when a
-- project-member policy checks whether the caller is a project manager.
CREATE SCHEMA IF NOT EXISTS pm_internal;
REVOKE ALL ON SCHEMA pm_internal FROM PUBLIC;
GRANT USAGE ON SCHEMA pm_internal TO authenticated;
CREATE FUNCTION pm_internal.can_manage_project(_project_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pm_projects p
    JOIN public.workspace_members wm
      ON wm.workspace_id = p.workspace_id
     AND wm.user_id = (SELECT auth.uid())
     AND wm.status = 'active'
    LEFT JOIN public.pm_project_members pm
      ON pm.project_id = p.id AND pm.user_id = wm.user_id
    WHERE p.id = _project_id
      AND p.workspace_id = _workspace_id
      AND (wm.role IN ('owner','admin','manager') OR p.owner_id = wm.user_id OR pm.role = 'manager')
  );
$$;
REVOKE ALL ON FUNCTION pm_internal.can_manage_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pm_internal.can_manage_project(uuid, uuid) TO authenticated;

-- Every read is confined to active workspace members. Role checks on writes
-- use the existing active-member-aware helpers from the CRM workspace schema.
CREATE POLICY pm_projects_select ON public.pm_projects FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, (SELECT auth.uid())));
CREATE POLICY pm_projects_insert ON public.pm_projects FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND public.has_workspace_role(workspace_id, (SELECT auth.uid()),
      ARRAY['owner','admin','manager','agent']::public.workspace_role[])
  );
CREATE POLICY pm_projects_update ON public.pm_projects FOR UPDATE TO authenticated
  USING (
    public.has_workspace_role(workspace_id, (SELECT auth.uid()),
      ARRAY['owner','admin','manager']::public.workspace_role[])
    OR (owner_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id, (SELECT auth.uid())))
    OR EXISTS (
      SELECT 1 FROM public.pm_project_members m
      WHERE m.project_id = pm_projects.id AND m.workspace_id = pm_projects.workspace_id
        AND m.user_id = (SELECT auth.uid()) AND m.role = 'manager'
    )
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, (SELECT auth.uid()))
    AND (
      public.has_workspace_role(workspace_id, (SELECT auth.uid()),
        ARRAY['owner','admin','manager']::public.workspace_role[])
      OR owner_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.pm_project_members m
        WHERE m.project_id = pm_projects.id AND m.workspace_id = pm_projects.workspace_id
          AND m.user_id = (SELECT auth.uid()) AND m.role = 'manager'
      )
    )
  );
CREATE POLICY pm_projects_delete ON public.pm_projects FOR DELETE TO authenticated
  USING (
    public.has_workspace_role(workspace_id, (SELECT auth.uid()),
      ARRAY['owner','admin','manager']::public.workspace_role[])
    OR (owner_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id, (SELECT auth.uid())))
  );

CREATE POLICY pm_project_members_select ON public.pm_project_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, (SELECT auth.uid())));
CREATE POLICY pm_project_members_insert ON public.pm_project_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id, user_id)
    AND pm_internal.can_manage_project(project_id, workspace_id)
  );
CREATE POLICY pm_project_members_update ON public.pm_project_members FOR UPDATE TO authenticated
  USING (pm_internal.can_manage_project(project_id, workspace_id))
  WITH CHECK (
    public.is_workspace_member(workspace_id, user_id)
    AND pm_internal.can_manage_project(project_id, workspace_id)
  );
CREATE POLICY pm_project_members_delete ON public.pm_project_members FOR DELETE TO authenticated
  USING (
    pm_internal.can_manage_project(project_id, workspace_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.pm_projects p
      WHERE p.id = pm_project_members.project_id
        AND p.workspace_id = pm_project_members.workspace_id
        AND p.owner_id = pm_project_members.user_id
    )
  );

CREATE POLICY pm_tasks_select ON public.pm_tasks FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, (SELECT auth.uid())));
CREATE POLICY pm_tasks_insert ON public.pm_tasks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pm_projects active_project
      WHERE active_project.id = pm_tasks.project_id
        AND active_project.workspace_id = pm_tasks.workspace_id
        AND active_project.status <> 'archived'
    )
    AND (assignee_id IS NULL OR (
      public.is_workspace_member(workspace_id, assignee_id)
      AND EXISTS (
        SELECT 1 FROM public.pm_project_members assigned
        WHERE assigned.workspace_id = pm_tasks.workspace_id AND assigned.project_id = pm_tasks.project_id
          AND assigned.user_id = pm_tasks.assignee_id AND assigned.role IN ('manager','member')
      )
    ))
    AND (
      public.has_workspace_role(workspace_id, (SELECT auth.uid()),
        ARRAY['owner','admin','manager']::public.workspace_role[])
      OR EXISTS (
        SELECT 1 FROM public.pm_projects p
        WHERE p.id = pm_tasks.project_id AND p.workspace_id = pm_tasks.workspace_id AND p.owner_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.pm_project_members m
        WHERE m.project_id = pm_tasks.project_id AND m.workspace_id = pm_tasks.workspace_id
          AND m.user_id = (SELECT auth.uid()) AND m.role IN ('manager','member')
      )
    )
  );
CREATE POLICY pm_tasks_update ON public.pm_tasks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pm_projects active_project
      WHERE active_project.id = pm_tasks.project_id
        AND active_project.workspace_id = pm_tasks.workspace_id
        AND active_project.status <> 'archived'
    )
    AND (
    public.has_workspace_role(workspace_id, (SELECT auth.uid()),
      ARRAY['owner','admin','manager']::public.workspace_role[])
    OR EXISTS (
      SELECT 1 FROM public.pm_projects p
      WHERE p.id = pm_tasks.project_id AND p.workspace_id = pm_tasks.workspace_id AND p.owner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.pm_project_members m
      WHERE m.project_id = pm_tasks.project_id AND m.workspace_id = pm_tasks.workspace_id
        AND m.user_id = (SELECT auth.uid()) AND m.role IN ('manager','member')
    )
    )
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.pm_projects active_project
      WHERE active_project.id = pm_tasks.project_id
        AND active_project.workspace_id = pm_tasks.workspace_id
        AND active_project.status <> 'archived'
    )
    AND (assignee_id IS NULL OR (
      public.is_workspace_member(workspace_id, assignee_id)
      AND EXISTS (
        SELECT 1 FROM public.pm_project_members assigned
        WHERE assigned.workspace_id = pm_tasks.workspace_id AND assigned.project_id = pm_tasks.project_id
          AND assigned.user_id = pm_tasks.assignee_id AND assigned.role IN ('manager','member')
      )
    ))
    AND (
      public.has_workspace_role(workspace_id, (SELECT auth.uid()),
        ARRAY['owner','admin','manager']::public.workspace_role[])
      OR EXISTS (
        SELECT 1 FROM public.pm_projects p
        WHERE p.id = pm_tasks.project_id AND p.workspace_id = pm_tasks.workspace_id AND p.owner_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.pm_project_members m
        WHERE m.project_id = pm_tasks.project_id AND m.workspace_id = pm_tasks.workspace_id
          AND m.user_id = (SELECT auth.uid()) AND m.role IN ('manager','member')
      )
    )
  );
CREATE POLICY pm_tasks_delete ON public.pm_tasks FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pm_projects active_project
      WHERE active_project.id = pm_tasks.project_id
        AND active_project.workspace_id = pm_tasks.workspace_id
        AND active_project.status <> 'archived'
    )
    AND (
    public.has_workspace_role(workspace_id, (SELECT auth.uid()),
      ARRAY['owner','admin','manager']::public.workspace_role[])
    OR EXISTS (
      SELECT 1 FROM public.pm_projects p
      WHERE p.id = pm_tasks.project_id AND p.workspace_id = pm_tasks.workspace_id AND p.owner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.pm_project_members m
      WHERE m.project_id = pm_tasks.project_id AND m.workspace_id = pm_tasks.workspace_id
        AND m.user_id = (SELECT auth.uid()) AND m.role IN ('manager','member')
    )
    )
  );

-- Keep tenant and relationship keys immutable through the Data API. Project
-- members are changed with explicit add/remove operations, never reassigned.
CREATE FUNCTION public.pm_reject_identity_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'Project management identity cannot be changed';
  END IF;
  IF TG_TABLE_NAME = 'pm_projects' AND
     (to_jsonb(NEW)->>'owner_id') IS DISTINCT FROM (to_jsonb(OLD)->>'owner_id') THEN
    RAISE EXCEPTION 'Project owner cannot be changed';
  END IF;
  IF TG_TABLE_NAME = 'pm_project_members' AND
     ((to_jsonb(NEW)->>'project_id') IS DISTINCT FROM (to_jsonb(OLD)->>'project_id') OR
      (to_jsonb(NEW)->>'user_id') IS DISTINCT FROM (to_jsonb(OLD)->>'user_id')) THEN
    RAISE EXCEPTION 'Project member identity cannot be changed';
  END IF;
  IF TG_TABLE_NAME = 'pm_tasks' AND
     ((to_jsonb(NEW)->>'project_id') IS DISTINCT FROM (to_jsonb(OLD)->>'project_id') OR
      (to_jsonb(NEW)->>'created_by') IS DISTINCT FROM (to_jsonb(OLD)->>'created_by')) THEN
    RAISE EXCEPTION 'Task identity cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pm_projects_scope_guard BEFORE UPDATE ON public.pm_projects
  FOR EACH ROW EXECUTE FUNCTION public.pm_reject_identity_change();
CREATE TRIGGER pm_project_members_scope_guard BEFORE UPDATE ON public.pm_project_members
  FOR EACH ROW EXECUTE FUNCTION public.pm_reject_identity_change();
CREATE TRIGGER pm_tasks_scope_guard BEFORE UPDATE ON public.pm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.pm_reject_identity_change();

-- The creator's manager seat cannot be demoted. Deletion of that seat is
-- denied by RLS; parent-project cascading deletes remain possible.
-- Demoting another member to viewer clears their assigned tasks atomically.
CREATE FUNCTION public.pm_guard_member_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pm_projects p
    WHERE p.id = OLD.project_id AND p.owner_id = OLD.user_id
  ) AND NEW.role <> 'manager' THEN
    RAISE EXCEPTION 'Project owner must remain a manager';
  END IF;
  IF OLD.role <> 'viewer' AND NEW.role = 'viewer' THEN
    UPDATE public.pm_tasks
    SET assignee_id = NULL
    WHERE project_id = OLD.project_id AND assignee_id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pm_project_members_guard_update BEFORE UPDATE ON public.pm_project_members
  FOR EACH ROW EXECUTE FUNCTION public.pm_guard_member_change();
CREATE TRIGGER pm_projects_updated_at BEFORE UPDATE ON public.pm_projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER pm_tasks_updated_at BEFORE UPDATE ON public.pm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- The creator starts as the project manager in one atomic insert.
CREATE FUNCTION public.pm_add_project_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.pm_project_members (workspace_id, project_id, user_id, role)
    VALUES (NEW.workspace_id, NEW.id, NEW.owner_id, 'manager');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pm_projects_add_owner AFTER INSERT ON public.pm_projects
  FOR EACH ROW EXECUTE FUNCTION public.pm_add_project_owner();
REVOKE ALL ON FUNCTION public.pm_reject_identity_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_guard_member_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_add_project_owner() FROM PUBLIC;
