-- public.settings: fix "new row violates row-level security policy" and
-- duplicate rows from upserts.
--
-- 1. RLS: the table had write policies only for scope='user' (own rows) and
--    scope='organization' (org owner/admin). Any write of a scope='workspace'
--    row under a user JWT (e.g. Compliance Center → saveComplianceSettings)
--    was rejected. Add a workspace-scope write policy for active workspace
--    owners/admins, mirroring other workspace-admin tables (inboxes,
--    workspace_invitations, ...). Platform-scope writes stay service-role only.
--
-- 2. Uniqueness: UNIQUE (scope, organization_id, workspace_id, user_id, key)
--    treated NULLs as distinct, so every
--      upsert(..., { onConflict: 'scope,organization_id,workspace_id,user_id,key' })
--    inserted a NEW row instead of updating (platform rows always have three
--    NULLs). That produced duplicates which then broke .maybeSingle() reads
--    ("multiple rows returned") and made reads return an arbitrary version.
--    Dedupe (keep the most recently updated row per logical key; every removed
--    row is preserved in a backup table) and recreate the constraint as
--    NULLS NOT DISTINCT (Postgres 15+).

-- ---------------------------------------------------------------- backup
CREATE TABLE IF NOT EXISTS public.settings_dedupe_backup_20261006 AS
  SELECT s.*, now() AS backed_up_at FROM public.settings s WHERE false;

ALTER TABLE public.settings_dedupe_backup_20261006 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.settings_dedupe_backup_20261006 FROM anon, authenticated;
GRANT ALL ON public.settings_dedupe_backup_20261006 TO service_role;
COMMENT ON TABLE public.settings_dedupe_backup_20261006 IS
  'Superseded duplicate public.settings rows removed by migration 20261006120000 (service role only). Safe to drop once verified.';

-- ---------------------------------------------------------------- dedupe
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY scope, organization_id, workspace_id, user_id, key
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS rn
  FROM public.settings
)
INSERT INTO public.settings_dedupe_backup_20261006
SELECT s.*, now() FROM public.settings s JOIN ranked r ON r.id = s.id WHERE r.rn > 1;

DELETE FROM public.settings s
USING public.settings_dedupe_backup_20261006 b
WHERE s.id = b.id;

-- ---------------------------------------------------------------- unique key
ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_scope_organization_id_workspace_id_user_id_key_key;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_scope_organization_id_workspace_id_user_id_key_key
  UNIQUE NULLS NOT DISTINCT (scope, organization_id, workspace_id, user_id, key);

-- ---------------------------------------------------------------- RLS
DROP POLICY IF EXISTS "Workspace admins manage workspace settings" ON public.settings;
CREATE POLICY "Workspace admins manage workspace settings"
  ON public.settings
  FOR ALL
  TO authenticated
  USING (
    scope = 'workspace'::public.settings_scope
    AND workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, auth.uid(),
          ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])
  )
  WITH CHECK (
    scope = 'workspace'::public.settings_scope
    AND workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, auth.uid(),
          ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role])
  );
