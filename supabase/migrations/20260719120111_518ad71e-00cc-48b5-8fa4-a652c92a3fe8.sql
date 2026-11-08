
DO $$
DECLARE
  admin_uid uuid;
  org_a uuid;
  org_b uuid;
  ws_a uuid;
  ws_b uuid;
BEGIN
  SELECT id INTO admin_uid FROM auth.users WHERE email='admin@demo.com' LIMIT 1;
  IF admin_uid IS NULL THEN RAISE NOTICE 'admin@demo.com not found; skipping E2E seed'; RETURN; END IF;

  -- Org A
  SELECT id INTO org_a FROM public.organizations WHERE name='E2E-Org-A' LIMIT 1;
  IF org_a IS NULL THEN
    INSERT INTO public.organizations(name, slug, owner_id) VALUES ('E2E-Org-A', 'e2e-org-a', admin_uid) RETURNING id INTO org_a;
  END IF;
  INSERT INTO public.organization_members(organization_id, user_id, role)
    VALUES (org_a, admin_uid, 'owner') ON CONFLICT DO NOTHING;

  -- Org B
  SELECT id INTO org_b FROM public.organizations WHERE name='E2E-Org-B' LIMIT 1;
  IF org_b IS NULL THEN
    INSERT INTO public.organizations(name, slug, owner_id) VALUES ('E2E-Org-B', 'e2e-org-b', admin_uid) RETURNING id INTO org_b;
  END IF;
  INSERT INTO public.organization_members(organization_id, user_id, role)
    VALUES (org_b, admin_uid, 'owner') ON CONFLICT DO NOTHING;

  -- Workspaces linked to each org
  SELECT id INTO ws_a FROM public.workspaces WHERE name='E2E-WS-A' AND owner_id=admin_uid LIMIT 1;
  IF ws_a IS NULL THEN
    INSERT INTO public.workspaces(name, slug, owner_id, organization_id, plan)
      VALUES ('E2E-WS-A', 'e2e-ws-a', admin_uid, org_a, 'free') RETURNING id INTO ws_a;
  ELSE
    UPDATE public.workspaces SET organization_id=org_a WHERE id=ws_a;
  END IF;

  SELECT id INTO ws_b FROM public.workspaces WHERE name='E2E-WS-B' AND owner_id=admin_uid LIMIT 1;
  IF ws_b IS NULL THEN
    INSERT INTO public.workspaces(name, slug, owner_id, organization_id, plan)
      VALUES ('E2E-WS-B', 'e2e-ws-b', admin_uid, org_b, 'free') RETURNING id INTO ws_b;
  ELSE
    UPDATE public.workspaces SET organization_id=org_b WHERE id=ws_b;
  END IF;

  -- Workspace membership (owner) so RLS on workspace-scoped tables allows inserts
  INSERT INTO public.workspace_members(workspace_id, user_id, role, status)
    VALUES (ws_a, admin_uid, 'owner', 'active') ON CONFLICT DO NOTHING;
  INSERT INTO public.workspace_members(workspace_id, user_id, role, status)
    VALUES (ws_b, admin_uid, 'owner', 'active') ON CONFLICT DO NOTHING;
END $$;
