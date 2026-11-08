-- ============================================================================
-- WACRM — purge demo accounts and everything they own.
--
-- Run this ONCE against a database that is going into production mode
-- (APP_MODE=production). It removes:
--   * the three published demo auth users (user@ / agent@ / admin@demo.com)
--     together with their sessions, identities and platform roles
--   * every organization and workspace those users own, and all tenant data
--     hanging off them (contacts, conversations, messages, channel accounts,
--     the E2E-Org-A/B + E2E-WS-A/B fixtures, seeded per-channel inboxes, ...)
--
-- It is deliberately NOT in supabase/migrations/: a routine `db push` must
-- never wipe a demo deployment. Run it by hand — Supabase SQL editor, psql, or
-- the Supabase MCP `execute_sql` tool.
--
-- SAFETY
--   * Only touches accounts whose email is one of the three published demo
--     addresses AND that carry the demo flag in app_metadata / user_metadata.
--     A real person who happens to own e.g. admin@demo.com is left alone
--     unless the account was created by the demo provisioner.
--   * Refuses to leave the platform with ZERO superadmins. The public /install
--     wizard re-opens for anyone while no superadmin exists (and setup is not
--     marked complete), so removing the last admin would hand the platform to
--     the first visitor. Create/promote your real superadmin first, or set
--     allow_no_superadmin := true below and finish /install immediately.
--   * Workspaces/orgs that also have non-demo members are NOT deleted —
--     ownership is transferred to the next member (prepare_platform_user_deletion).
--   * Idempotent: a second run finds no demo accounts and does nothing.
--
-- USAGE
--   1. First run with dry_run := true (default below). It performs every
--      delete, then ROLLS BACK and reports what would have been removed as the
--      error message.
--   2. Set dry_run := false and run again to commit.
-- ============================================================================

DO $purge$
DECLARE
  -- ---- Operator switches ----------------------------------------------------
  dry_run             constant boolean := true;   -- true = do it, report, then roll back
  allow_no_superadmin constant boolean := false;  -- true = permit zero superadmins afterwards
  -- ---------------------------------------------------------------------------

  demo_emails constant text[] := ARRAY['user@demo.com', 'agent@demo.com', 'admin@demo.com'];

  demo_ids          uuid[];
  org_ids           uuid[];
  ws_ids            uuid[];
  uid               uuid;
  other_superadmins integer;
  n_contacts        bigint;
  n_conversations   bigint;
  n_messages        bigint;
  n_channel_accts   bigint;
  survivors_ws      integer;
  survivors_org     integer;
  remaining_users   integer;
  summary           text;
BEGIN
  -- 1) Identify the demo accounts (email match AND demo flag).
  SELECT COALESCE(array_agg(u.id), '{}') INTO demo_ids
  FROM auth.users u
  WHERE lower(u.email) = ANY (demo_emails)
    AND (   COALESCE(u.raw_app_meta_data  ->> 'demo', '') = 'true'
         OR COALESCE(u.raw_user_meta_data ->> 'demo', '') = 'true');

  IF cardinality(demo_ids) = 0 THEN
    RAISE NOTICE 'No demo accounts found — nothing to purge.';
    RETURN;
  END IF;

  -- 2) Never strand the platform without an administrator.
  SELECT count(*) INTO other_superadmins
  FROM public.user_roles r
  WHERE r.role = 'superadmin' AND r.user_id <> ALL (demo_ids);

  IF other_superadmins = 0 AND NOT allow_no_superadmin THEN
    RAISE EXCEPTION
      'Refusing to purge: the demo accounts hold the only superadmin role. '
      'Removing them would re-open the public /install bootstrap to the first visitor. '
      'Create and promote a real superadmin first, or set allow_no_superadmin := true '
      'and complete /install immediately after.';
  END IF;

  -- 3) Measure what is about to go (organizations and workspaces they own).
  SELECT COALESCE(array_agg(id), '{}') INTO org_ids
  FROM public.organizations WHERE owner_id = ANY (demo_ids);

  SELECT COALESCE(array_agg(id), '{}') INTO ws_ids
  FROM public.workspaces
  WHERE owner_id = ANY (demo_ids) OR organization_id = ANY (org_ids);

  SELECT count(*) INTO n_contacts       FROM public.contacts         WHERE workspace_id = ANY (ws_ids);
  SELECT count(*) INTO n_conversations  FROM public.conversations    WHERE workspace_id = ANY (ws_ids);
  SELECT count(*) INTO n_messages       FROM public.messages         WHERE workspace_id = ANY (ws_ids);
  SELECT count(*) INTO n_channel_accts  FROM public.channel_accounts WHERE workspace_id = ANY (ws_ids);

  -- 4) Delete. organizations.owner_id / workspaces.owner_id are ON DELETE
  --    RESTRICT, so ownership has to be resolved before the auth user can go;
  --    prepare_platform_user_deletion() is the app's own routine for that
  --    (deletes single-member orgs/workspaces, hands multi-member ones on).
  FOREACH uid IN ARRAY demo_ids LOOP
    PERFORM public.prepare_platform_user_deletion(uid);
  END LOOP;

  DELETE FROM public.user_roles WHERE user_id = ANY (demo_ids);
  DELETE FROM auth.users        WHERE id      = ANY (demo_ids);

  -- 5) Verify.
  SELECT count(*) INTO survivors_ws  FROM public.workspaces    WHERE id = ANY (ws_ids);
  SELECT count(*) INTO survivors_org FROM public.organizations WHERE id = ANY (org_ids);
  SELECT count(*) INTO remaining_users
  FROM auth.users WHERE lower(email) = ANY (demo_emails)
    AND (   COALESCE(raw_app_meta_data  ->> 'demo', '') = 'true'
         OR COALESCE(raw_user_meta_data ->> 'demo', '') = 'true');

  summary := format(
    'demo users removed: %s | organizations targeted: %s (still present: %s) | '
    'workspaces targeted: %s (still present: %s) | contacts: %s | conversations: %s | '
    'messages: %s | channel accounts: %s | demo users remaining: %s | '
    'other superadmins: %s',
    cardinality(demo_ids), cardinality(org_ids), survivors_org,
    cardinality(ws_ids), survivors_ws, n_contacts, n_conversations,
    n_messages, n_channel_accts, remaining_users, other_superadmins);

  IF remaining_users <> 0 THEN
    RAISE EXCEPTION 'Purge incomplete, rolling back. %', summary;
  END IF;

  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN — rolled back, nothing was deleted. Would remove: %', summary;
  END IF;

  RAISE NOTICE 'Demo purge committed. %', summary;
END
$purge$;
