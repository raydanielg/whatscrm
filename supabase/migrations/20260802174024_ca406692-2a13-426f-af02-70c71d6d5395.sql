DROP POLICY IF EXISTS "Workspace admins manage rematch jobs" ON public.contact_rematch_jobs;
DROP POLICY IF EXISTS "Workspace members read rematch jobs" ON public.contact_rematch_jobs;

CREATE POLICY "Workspace admins manage rematch jobs"
ON public.contact_rematch_jobs
FOR ALL
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Workspace members read rematch jobs"
ON public.contact_rematch_jobs
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));