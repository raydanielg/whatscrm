-- pg_cron helper: read the target URL and token from Supabase Vault.
--
-- `_wa_cron_post` is the base of every scheduled HTTP job (outbox, webhooks,
-- workflows, syncs, reminders, ...). It used to carry a hard-coded third-party
-- deployment URL and a literal cron token in its body — so on any other
-- deployment the jobs POSTed to somebody else's app with a token that could
-- never match this app's INTERNAL_CRON_TOKEN.
--
-- It now reads two Vault secrets:
--
--   wacrm_cron_base_url   e.g. https://app.example.com   (this deployment's origin)
--   wacrm_cron_token      the same value as INTERNAL_CRON_TOKEN
--
-- If either is missing (or Vault is not installed) the helper is a no-op that
-- returns NULL: nothing is posted and no request id is created. Release
-- Readiness -> "Scheduled jobs call this deployment" reports that state.
--
-- Set them once per environment (SQL editor, as postgres):
--
--   select vault.create_secret('https://app.example.com', 'wacrm_cron_base_url');
--   select vault.create_secret('<same value as INTERNAL_CRON_TOKEN>', 'wacrm_cron_token');
--
-- To change one later use vault.update_secret(<id>, <new value>).
--
-- NOTE: the previous literal token is still in migration history
-- (20260717131036). Treat it as exposed and rotate INTERNAL_CRON_TOKEN.

CREATE OR REPLACE FUNCTION public._wa_cron_post(_path text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $$
DECLARE
  _base  text;
  _token text;
  _req   bigint;
BEGIN
  -- Vault missing (self-hosted without the extension): nothing to read.
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE $q$
    SELECT max(decrypted_secret) FILTER (WHERE name = 'wacrm_cron_base_url'),
           max(decrypted_secret) FILTER (WHERE name = 'wacrm_cron_token')
      FROM vault.decrypted_secrets
     WHERE name IN ('wacrm_cron_base_url', 'wacrm_cron_token')
  $q$ INTO _base, _token;

  _base  := rtrim(btrim(COALESCE(_base, '')), '/');
  _token := btrim(COALESCE(_token, ''));

  -- Not configured (or not a usable URL): do nothing rather than post somewhere
  -- unintended or with an empty credential.
  IF _base !~ '^https?://[^/[:space:]]+' OR _token = '' THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := _base || _path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', _token),
    body := _body,
    timeout_milliseconds := 55000
  ) INTO _req;
  RETURN _req;
END;
$$;

-- Same exposure as before: never callable by API roles (it forwards a credential).
REVOKE ALL ON FUNCTION public._wa_cron_post(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._wa_cron_post(text, jsonb) TO service_role;

-- Release Readiness facts: report where the helper is configured from, and
-- whether the Vault token matches the app's INTERNAL_CRON_TOKEN — as a SHA-256
-- so the token itself is never returned (the app compares hashes server-side
-- and only surfaces a yes/no).
CREATE OR REPLACE FUNCTION public.platform_readiness_facts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_jobs     integer := NULL;
  cron_def      text;
  legacy_base   text;
  vault_base    text;
  vault_token   text;
  literal_token boolean;
  cron_source   text;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job' INTO cron_jobs;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO cron_def
  FROM pg_proc p
  WHERE p.proname = '_wa_cron_post' AND p.pronamespace = 'public'::regnamespace
  LIMIT 1;

  -- Older installs still carry the URL / token as literals in the function body.
  legacy_base   := substring(cron_def FROM '_base text := ''([^'']+)''');
  literal_token := COALESCE(cron_def ~ '_token text := ''[^'']+''', false);

  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE $q$
      SELECT max(decrypted_secret) FILTER (WHERE name = 'wacrm_cron_base_url'),
             max(decrypted_secret) FILTER (WHERE name = 'wacrm_cron_token')
        FROM vault.decrypted_secrets
       WHERE name IN ('wacrm_cron_base_url', 'wacrm_cron_token')
    $q$ INTO vault_base, vault_token;
  END IF;
  vault_base  := NULLIF(rtrim(btrim(COALESCE(vault_base, '')), '/'), '');
  vault_token := NULLIF(btrim(COALESCE(vault_token, '')), '');

  cron_source := CASE
    WHEN vault_base IS NOT NULL AND vault_token IS NOT NULL THEN 'vault'
    WHEN legacy_base IS NOT NULL AND literal_token         THEN 'function-literal'
    ELSE 'none'
  END;

  RETURN jsonb_build_object(
    'public_tables',
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'),
    'tables_without_rls',
      COALESCE((SELECT jsonb_agg(c.relname ORDER BY c.relname)
                  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity), '[]'::jsonb),
    'cron_available',  cron_jobs IS NOT NULL,
    'cron_jobs',       cron_jobs,
    'cron_post_fn',    cron_def IS NOT NULL,
    'cron_config_source', cron_source,
    'cron_base_url',   CASE cron_source WHEN 'vault' THEN vault_base
                                        WHEN 'function-literal' THEN legacy_base END,
    'cron_token_sha256', CASE cron_source
                           WHEN 'vault' THEN encode(sha256(convert_to(vault_token, 'UTF8')), 'hex')
                         END,
    'cron_token_literal', literal_token,
    'buckets',         COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM storage.buckets), '[]'::jsonb),
    'staff_users',     (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role IN ('superadmin', 'support')),
    'staff_with_2fa',  (SELECT count(DISTINCT r.user_id) FROM public.user_roles r
                          JOIN public.user_2fa f ON f.user_id = r.user_id AND f.enabled
                         WHERE r.role IN ('superadmin', 'support')),
    'completed_backups', (SELECT count(*) FROM public.backup_jobs
                           WHERE status IN ('completed', 'verified') AND storage_path IS NOT NULL),
    'demo_accounts',   (SELECT count(*) FROM auth.users
                         WHERE COALESCE(raw_app_meta_data ->> 'demo', '') = 'true'
                            OR COALESCE(raw_user_meta_data ->> 'demo', '') = 'true')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_readiness_facts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_readiness_facts() TO service_role;
