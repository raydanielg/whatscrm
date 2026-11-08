-- Project logos use the existing private branding bucket and public image route.
ALTER TABLE public.pm_projects ADD COLUMN IF NOT EXISTS logo_url text;

-- Project managers may manage images only inside their own project's folder.
CREATE POLICY pm_project_logo_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND split_part(name, '/', 1) = 'workspace'
  AND split_part(name, '/', 3) = 'projects'
  AND EXISTS (
    SELECT 1 FROM public.pm_projects p
    WHERE p.workspace_id::text = split_part(name, '/', 2)
      AND p.id::text = split_part(name, '/', 4)
      AND pm_internal.can_manage_project(p.id, p.workspace_id)
  )
);

CREATE POLICY pm_project_logo_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'branding'
  AND split_part(name, '/', 1) = 'workspace'
  AND split_part(name, '/', 3) = 'projects'
  AND EXISTS (
    SELECT 1 FROM public.pm_projects p
    WHERE p.workspace_id::text = split_part(name, '/', 2)
      AND p.id::text = split_part(name, '/', 4)
      AND pm_internal.can_manage_project(p.id, p.workspace_id)
  )
);
