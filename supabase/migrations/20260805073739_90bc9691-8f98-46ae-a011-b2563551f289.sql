DROP POLICY IF EXISTS "Members read org activities" ON public.activities;
CREATE POLICY "Members read org activities"
ON public.activities FOR SELECT TO authenticated
USING (
  CASE
    WHEN organization_id IS NOT NULL THEN public.is_org_member(organization_id, auth.uid())
    WHEN workspace_id IS NOT NULL THEN public.is_workspace_member(workspace_id, auth.uid())
    ELSE public.is_super_admin(auth.uid())
  END
);

DROP POLICY IF EXISTS "org_admins_read_revenue" ON public.billing_revenue_snapshots;
CREATE POLICY "org_admins_read_revenue"
ON public.billing_revenue_snapshots FOR SELECT TO authenticated
USING (
  CASE
    WHEN organization_id IS NOT NULL THEN public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role])
    ELSE public.is_super_admin(auth.uid())
  END
);