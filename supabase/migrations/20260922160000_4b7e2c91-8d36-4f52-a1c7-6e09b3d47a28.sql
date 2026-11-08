-- Demo accounts are read-only, enforced in the database.
--
-- The previous guard lived in browser JavaScript (src/lib/demo/write-guard.ts).
-- That is not an access-control boundary: the demo credentials are printed on
-- the /auth page and the publishable key is public, so anyone could obtain a
-- demo JWT and POST directly to /rest/v1/<table>, bypassing the app entirely.
-- RLS permits those writes because demo users are genuine organization owners.
--
-- Enforcement therefore has to sit below PostgREST. The client guard stays, but
-- only as fast UI feedback; this is the boundary.

-- 1) Mark the demo accounts in app_metadata.
--    app_metadata is chosen deliberately over user_metadata: a signed-in user
--    can rewrite their own user_metadata (and so clear the flag), but only the
--    service role can write app_metadata. It is also carried in the JWT, which
--    lets the check below avoid touching auth.users on every statement.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"demo": true}'::jsonb
WHERE email IN ('user@demo.com', 'agent@demo.com', 'admin@demo.com');

-- 2) Read the flag straight off the request JWT — no table access, so this is
--    cheap enough to run on every write statement.
-- Defensive on purpose. `request.jwt.claims` is normally well-formed JSON from
-- GoTrue, but it can be absent, empty, or malformed depending on how the
-- connection was set up — and a plain `::jsonb` cast on an empty string raises
-- 22P02 "invalid input syntax for type json". Because this runs from a trigger
-- on every write, letting that propagate would block ALL writes for ALL users,
-- turning a demo guard into an outage. Fail open on anything unparseable: a
-- genuine demo JWT is always valid JSON, so the boundary still holds.
CREATE OR REPLACE FUNCTION public.is_demo_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text := current_setting('request.jwt.claims', true);
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN false;
  END IF;
  RETURN COALESCE((raw::jsonb -> 'app_metadata' ->> 'demo') = 'true', false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_demo_session() TO anon, authenticated, service_role;

-- 3) The blocker. Statement-level, not row-level: it only needs to refuse the
--    statement, so it runs once per write instead of once per row.
--    service_role has no request.jwt.claims and is unaffected, which keeps
--    server-side provisioning (ensure_personal_organization, demo seeding)
--    working.
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
  RETURN NULL; -- ignored for statement-level triggers
END;
$$;

-- 4) Attach to every base table in public except the session-scoped ones.
--    Blocking those breaks login, session listing and idle logout for demo
--    users. Note user_2fa is NOT exempt: it was on the client guard's
--    allowlist, which would have let a visitor enable 2FA on a shared demo
--    account with a secret only they held and lock everyone else out.
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
