-- 1) Storage buckets the app already depends on.
--
-- The app uploads to nine buckets and the schema already carries 30 storage
-- policies naming them, but NO migration ever created a bucket. On a fresh
-- install every upload — logo/branding, avatars, inbox attachments, campaign
-- media, custom-field files, knowledge-base sources, social media, widget
-- uploads and exports — failed with "Bucket not found".
--
-- All are private: every policy is `authenticated`-only and the app serves files
-- through signed URLs or a server-side download, never a public URL.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars',        'avatars',        false),
  ('attachments',    'attachments',    false),
  ('branding',       'branding',       false),
  ('campaign-media', 'campaign-media', false),
  ('custom-fields',  'custom-fields',  false),
  ('exports',        'exports',        false),
  ('kb-sources',     'kb-sources',     false),
  ('social-media',   'social-media',   false),
  ('widget-uploads', 'widget-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- 2) Facts for Super Admin -> Release Readiness.
--
-- The readiness page used to hard-code "pass" for claims nothing verified.
-- These are the platform-level facts that CAN be measured from inside the
-- database. Read-only; service_role only (it reveals infrastructure detail).
CREATE OR REPLACE FUNCTION public.platform_readiness_facts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_jobs integer := NULL;
  cron_def  text;
  base_url  text;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job' INTO cron_jobs;
  END IF;

  -- Every scheduled HTTP job goes through _wa_cron_post. Report where it posts
  -- and whether it carries a literal token, without returning the token itself.
  SELECT pg_get_functiondef(p.oid) INTO cron_def
  FROM pg_proc p
  WHERE p.proname = '_wa_cron_post' AND p.pronamespace = 'public'::regnamespace
  LIMIT 1;
  base_url := substring(cron_def FROM '_base text := ''([^'']+)''');

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
    'cron_base_url',   base_url,
    'cron_token_literal', COALESCE(cron_def ~ '_token text := ''[^'']+''', false),
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
