-- workspace_role gained a 'manager' value after
-- _system_role_for_workspace_role() was written (20261018150000), so its CASE
-- fell through to NULL for managers. Callers treat a NULL mapping as "no role
-- to assign" and skip the user_role_assignments insert entirely — see
-- accept_workspace_invitation() and apply_my_auto_invite_rules(), which both
-- guard on `IF _role_id IS NOT NULL`. The result is that a member invited as
-- Manager lands with zero permissions and an almost-empty sidebar, which is
-- the exact failure 20261018150000 set out to fix for the other roles.
--
-- The 'manager' system role is already seeded (20260717102207) with 48
-- permissions, so this only needs the mapping.

CREATE OR REPLACE FUNCTION public._system_role_for_workspace_role(_role public.workspace_role)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role
    WHEN 'owner' THEN 'admin'
    WHEN 'admin' THEN 'admin'
    WHEN 'manager' THEN 'manager'
    WHEN 'agent' THEN 'support_agent'
    WHEN 'viewer' THEN 'viewer'
  END;
$$;

-- Backfill managers who were left without any role assignment.
INSERT INTO public.user_role_assignments (user_id, role_id, organization_id, granted_by)
SELECT DISTINCT wm.user_id, r.id, w.organization_id, NULL::uuid
FROM public.workspace_members wm
JOIN public.workspaces w ON w.id = wm.workspace_id
JOIN public.roles r ON r.organization_id IS NULL AND r.key = 'manager'
WHERE wm.role = 'manager'
  AND w.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = wm.user_id
      AND (ura.organization_id = w.organization_id OR ura.organization_id IS NULL)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = w.organization_id
      AND om.user_id = wm.user_id
      AND om.role IN ('owner', 'admin')
  )
ON CONFLICT DO NOTHING;
