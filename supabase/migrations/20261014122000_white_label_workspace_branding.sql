-- White-label images belong to a workspace, including legacy workspaces
-- without an organization. Public delivery still goes through the app route.
CREATE POLICY "branding_workspace_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND split_part(name, '/', 1) = 'workspace'
  AND public.has_workspace_role(
    nullif(split_part(name, '/', 2), '')::uuid,
    auth.uid(),
    ARRAY['owner'::workspace_role, 'admin'::workspace_role]
  )
);

CREATE POLICY "branding_workspace_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'branding'
  AND split_part(name, '/', 1) = 'workspace'
  AND public.has_workspace_role(
    nullif(split_part(name, '/', 2), '')::uuid,
    auth.uid(),
    ARRAY['owner'::workspace_role, 'admin'::workspace_role]
  )
)
WITH CHECK (
  bucket_id = 'branding'
  AND split_part(name, '/', 1) = 'workspace'
  AND public.has_workspace_role(
    nullif(split_part(name, '/', 2), '')::uuid,
    auth.uid(),
    ARRAY['owner'::workspace_role, 'admin'::workspace_role]
  )
);

CREATE POLICY "branding_workspace_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'branding'
  AND split_part(name, '/', 1) = 'workspace'
  AND public.has_workspace_role(
    nullif(split_part(name, '/', 2), '')::uuid,
    auth.uid(),
    ARRAY['owner'::workspace_role, 'admin'::workspace_role]
  )
);
