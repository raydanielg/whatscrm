-- Fix: creating an organization from the UI produced an org with no members.
--
-- "Admins can add members" (20260717083322) gates INSERT on
-- organization_members behind has_org_role(), which itself reads
-- organization_members. A brand-new organization has no rows yet, so the very
-- first membership insert — the owner adding themselves — was ALWAYS denied
-- by RLS. The organizations INSERT policy only checks owner_id, so the org row
-- was created regardless. The result was an organization with zero members.
--
-- The owner still saw it in the switcher (the SELECT policy also allows
-- owner_id = auth.uid()), but every membership-scoped query denied, which
-- surfaced as "Invalid organization ID" on plan selection, "No organization
-- found for use" on extension install, and a workspace settings page that
-- spins forever.
--
-- ensure_personal_organization() (20260808095647) already covers a user's
-- FIRST org because it runs as service_role and bypasses RLS. It does not
-- cover creating an additional organization from the switcher, which is the
-- path that stayed broken.
--
-- RLS policies are permissive and OR'ed together, so this adds the bootstrap
-- case alongside the existing admin path without widening it: a user may
-- insert a membership row for THEMSELVES, and only into an organization they
-- already own.

CREATE POLICY "Owners can bootstrap their own membership"
  ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = organization_id
        AND o.owner_id = auth.uid()
    )
  );

-- Repair organizations orphaned while the policy was broken: give each one's
-- owner the owner membership row the insert could never create.
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, o.owner_id, 'owner'::public.org_role
FROM public.organizations o
WHERE o.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = o.id
      AND m.user_id = o.owner_id
  )
ON CONFLICT (organization_id, user_id) DO NOTHING;
