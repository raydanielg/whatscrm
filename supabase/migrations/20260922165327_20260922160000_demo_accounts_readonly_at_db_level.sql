UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"demo": true}'::jsonb
WHERE email IN ('user@demo.com', 'agent@demo.com', 'admin@demo.com');

CREATE OR REPLACE FUNCTION public.is_demo_session()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'demo') = 'true',
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_demo_session() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_block_demo_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_demo_session() THEN
    RAISE EXCEPTION
      'Demo mode: % on "%" is disabled. Sign in with a real account to make changes.',
      lower(TG_OP), TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t record;
  exempt text[] := ARRAY['sessions', 'login_history', 'account_lockouts'];
BEGIN
  FOR t IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT (c.relname = ANY (exempt))
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_block_demo_writes ON public.%I', t.name);
    EXECUTE format(
      'CREATE TRIGGER trg_block_demo_writes '
      'BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.tg_block_demo_writes()',
      t.name
    );
  END LOOP;
END $$;
