DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE u.email_confirmed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_members om WHERE om.user_id = u.id
      )
  LOOP
    PERFORM public.ensure_personal_organization(r.id, r.email);
  END LOOP;
END;
$$;