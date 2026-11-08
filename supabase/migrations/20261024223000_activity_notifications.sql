-- Persist actionable project and task changes in the main notification inbox.
-- Triggers run as the migration owner because notifications are service-write only.
CREATE OR REPLACE FUNCTION public.notify_work_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  org_id uuid;
  recipient uuid;
  headline text;
  detail text;
  target text;
  payload jsonb;
BEGIN
  SELECT organization_id INTO org_id FROM public.workspaces WHERE id = NEW.workspace_id;
  IF org_id IS NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'tasks' THEN
    IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
      IF ROW(NEW.title, NEW.status, NEW.assigned_to, NEW.due_at)
         IS NOT DISTINCT FROM ROW(OLD.title, OLD.status, OLD.assigned_to, OLD.due_at) THEN RETURN NEW; END IF;
    END IF;
    headline := CASE WHEN TG_OP = 'INSERT' THEN 'New CRM task: ' || NEW.title
      WHEN NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN 'CRM task assigned: ' || NEW.title
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'CRM task ' || NEW.status || ': ' || NEW.title
      ELSE 'CRM task updated: ' || NEW.title END;
    detail := CASE WHEN NEW.due_at IS NOT NULL THEN 'Due ' || to_char(NEW.due_at, 'Mon DD, YYYY HH24:MI TZ')
      ELSE 'Open this task to review the latest changes.' END;
    target := '/tasks?taskId=' || NEW.id::text;
    payload := jsonb_build_object('task_id', NEW.id, 'workspace_id', NEW.workspace_id, 'kind', 'activity');
    FOR recipient IN SELECT DISTINCT user_id FROM (VALUES (NEW.assigned_to), (NEW.created_by)) AS people(user_id)
      WHERE user_id IS NOT NULL LOOP
      IF EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = NEW.workspace_id
          AND m.user_id = recipient AND m.status = 'active') THEN
        INSERT INTO public.notifications(user_id, organization_id, title, body, category, action_url, data)
        VALUES (recipient, org_id, headline, detail, 'task', target, payload);
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME = 'pm_tasks' THEN
    IF TG_OP = 'UPDATE' THEN
      IF ROW(NEW.title, NEW.status, NEW.assignee_id, NEW.due_date)
         IS NOT DISTINCT FROM ROW(OLD.title, OLD.status, OLD.assignee_id, OLD.due_date) THEN RETURN NEW; END IF;
    END IF;
    headline := CASE WHEN TG_OP = 'INSERT' THEN 'New project task: ' || NEW.title
      WHEN NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN 'Project task assigned: ' || NEW.title
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'Project task ' || replace(NEW.status, '_', ' ') || ': ' || NEW.title
      ELSE 'Project task updated: ' || NEW.title END;
    SELECT name INTO detail FROM public.pm_projects WHERE id = NEW.project_id;
    detail := coalesce(detail, 'Project') || CASE WHEN NEW.due_date IS NOT NULL THEN ' · Due ' || NEW.due_date::text ELSE '' END;
    target := '/projects/' || NEW.project_id::text || '?taskId=' || NEW.id::text;
    payload := jsonb_build_object('pm_task_id', NEW.id, 'project_id', NEW.project_id, 'workspace_id', NEW.workspace_id, 'kind', 'activity');
    FOR recipient IN SELECT DISTINCT user_id FROM (VALUES (NEW.assignee_id), (NEW.created_by)) AS people(user_id)
      WHERE user_id IS NOT NULL LOOP
      IF EXISTS (SELECT 1 FROM public.pm_project_members pm JOIN public.workspace_members m
          ON m.workspace_id = pm.workspace_id AND m.user_id = pm.user_id
          WHERE pm.project_id = NEW.project_id AND pm.user_id = recipient AND m.status = 'active') THEN
        INSERT INTO public.notifications(user_id, organization_id, title, body, category, action_url, data)
        VALUES (recipient, org_id, headline, detail, 'task', target, payload);
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME = 'pm_projects' THEN
    IF TG_OP = 'UPDATE' THEN
      IF ROW(NEW.name, NEW.status, NEW.due_date)
         IS NOT DISTINCT FROM ROW(OLD.name, OLD.status, OLD.due_date) THEN RETURN NEW; END IF;
    END IF;
    headline := CASE WHEN TG_OP = 'INSERT' THEN 'New project: ' || NEW.name
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'Project ' || replace(NEW.status, '_', ' ') || ': ' || NEW.name
      ELSE 'Project updated: ' || NEW.name END;
    detail := CASE WHEN NEW.due_date IS NOT NULL THEN 'Deadline ' || NEW.due_date::text
      ELSE 'Open the project to review the latest changes.' END;
    target := '/projects/' || NEW.id::text;
    payload := jsonb_build_object('project_id', NEW.id, 'workspace_id', NEW.workspace_id, 'kind', 'activity');
    FOR recipient IN SELECT pm.user_id FROM public.pm_project_members pm JOIN public.workspace_members m
      ON m.workspace_id = pm.workspace_id AND m.user_id = pm.user_id
      WHERE pm.project_id = NEW.id AND m.status = 'active'
      UNION SELECT NEW.owner_id WHERE NEW.owner_id IS NOT NULL LOOP
      INSERT INTO public.notifications(user_id, organization_id, title, body, category, action_url, data)
      VALUES (recipient, org_id, headline, detail, 'workspace', target, payload);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_work_activity() FROM PUBLIC;

CREATE TRIGGER tasks_notify_activity AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_work_activity();
CREATE TRIGGER pm_tasks_notify_activity AFTER INSERT OR UPDATE ON public.pm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_work_activity();
CREATE TRIGGER pm_projects_notify_activity AFTER INSERT OR UPDATE ON public.pm_projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_work_activity();

CREATE TABLE public.pm_project_reminder_log (
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('week', 'day', 'due', 'overdue')),
  due_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id, kind, due_date)
);
ALTER TABLE public.pm_project_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pm_project_reminder_log FROM anon, authenticated;
GRANT ALL ON public.pm_project_reminder_log TO service_role;

-- Seed only actionable existing work, without flooding the inbox with history.
INSERT INTO public.notifications(user_id, organization_id, title, body, category, action_url, data)
SELECT DISTINCT m.user_id, w.organization_id, 'Upcoming project: ' || p.name,
  'Deadline ' || p.due_date::text, 'workspace', '/projects/' || p.id::text,
  jsonb_build_object('project_id', p.id, 'workspace_id', p.workspace_id, 'kind', 'upcoming')
FROM public.pm_projects p JOIN public.workspaces w ON w.id = p.workspace_id
JOIN public.pm_project_members pm ON pm.project_id = p.id
JOIN public.workspace_members m ON m.workspace_id = p.workspace_id AND m.user_id = pm.user_id AND m.status = 'active'
WHERE p.status NOT IN ('completed', 'archived') AND p.due_date BETWEEN current_date AND current_date + 14
  AND w.organization_id IS NOT NULL;

INSERT INTO public.notifications(user_id, organization_id, title, body, category, action_url, data)
SELECT DISTINCT m.user_id, w.organization_id, 'Recent project task: ' || t.title,
  p.name, 'task', '/projects/' || p.id::text || '?taskId=' || t.id::text,
  jsonb_build_object('pm_task_id', t.id, 'project_id', p.id, 'workspace_id', t.workspace_id, 'kind', 'activity')
FROM public.pm_tasks t JOIN public.pm_projects p ON p.id = t.project_id
JOIN public.workspaces w ON w.id = t.workspace_id
JOIN public.workspace_members m ON m.workspace_id = t.workspace_id AND m.status = 'active'
JOIN public.pm_project_members pm ON pm.project_id = t.project_id AND pm.user_id = m.user_id
WHERE m.user_id IN (t.assignee_id, t.created_by) AND t.status <> 'done'
  AND t.created_at >= now() - interval '7 days' AND w.organization_id IS NOT NULL;

INSERT INTO public.notifications(user_id, organization_id, title, body, category, action_url, data)
SELECT DISTINCT m.user_id, w.organization_id, 'Recent CRM task: ' || t.title,
  CASE WHEN t.due_at IS NOT NULL THEN 'Due ' || t.due_at::text ELSE 'Open this task for details.' END,
  'task', '/tasks?taskId=' || t.id::text,
  jsonb_build_object('task_id', t.id, 'workspace_id', t.workspace_id, 'kind', 'activity')
FROM public.tasks t JOIN public.workspaces w ON w.id = t.workspace_id
JOIN public.workspace_members m ON m.workspace_id = t.workspace_id AND m.status = 'active'
WHERE m.user_id IN (t.assigned_to, t.created_by) AND t.deleted_at IS NULL
  AND t.status IN ('open', 'in_progress') AND t.created_at >= now() - interval '7 days'
  AND w.organization_id IS NOT NULL;
