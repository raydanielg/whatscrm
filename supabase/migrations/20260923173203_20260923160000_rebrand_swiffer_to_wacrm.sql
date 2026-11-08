-- Rebrand Swiffer -> WACRM (database side).
--
-- Mirrors the earlier Wadiff -> Swiffer pass (20260807103510, 20260807112237).
-- Every statement is guarded so the migration is safe to run against a schema
-- where an optional table was never created, and is idempotent on re-run.

-- 1. `target_platform` column defaults and existing rows. -------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'target_platform'
      AND c.column_default ILIKE '%swiffer%'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN target_platform SET DEFAULT %L',
                   t.table_schema, t.table_name, 'wacrm');
  END LOOP;

  FOR t IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'target_platform'
  LOOP
    EXECUTE format('UPDATE %I.%I SET target_platform = %L WHERE target_platform = %L',
                   t.table_schema, t.table_name, 'wacrm', 'swiffer');
  END LOOP;
END $$;

-- 2. pg_cron job names: swiffer-* -> wacrm-*. -------------------------------
-- Skipped silently when the role cannot see/modify the cron schema.
DO $$
DECLARE j record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'cron.job not visible to this role - skipping job rename';
    RETURN;
  END IF;
  FOR j IN SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'swiffer-%'
  LOOP
    PERFORM cron.unschedule(j.jobname);
    PERFORM cron.schedule(replace(j.jobname, 'swiffer-', 'wacrm-'), j.schedule, j.command);
  END LOOP;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'insufficient privilege for cron rename - skipping';
END $$;

-- 3. Seeded marketplace / plugin text and URLs. -----------------------------
DO $$
BEGIN
  IF to_regclass('public.marketplace_integrations') IS NOT NULL THEN
    UPDATE public.marketplace_integrations
       SET docs_url = replace(docs_url, 'swiffer', 'wacrm')
     WHERE docs_url ILIKE '%swiffer%';
    UPDATE public.marketplace_integrations
       SET tagline = replace(replace(tagline, 'Swiffer', 'WACRM'), 'swiffer', 'wacrm')
     WHERE tagline ILIKE '%swiffer%';
  END IF;

  IF to_regclass('public.plugin_categories') IS NOT NULL THEN
    UPDATE public.plugin_categories
       SET description = replace(replace(description, 'Swiffer', 'WACRM'), 'swiffer', 'wacrm')
     WHERE description ILIKE '%swiffer%';
  END IF;

  IF to_regclass('public.plugins') IS NOT NULL THEN
    UPDATE public.plugins
       SET publisher_name = replace(replace(publisher_name, 'Swiffer', 'WACRM'), 'swiffer', 'wacrm')
     WHERE publisher_name ILIKE '%swiffer%';
  END IF;
END $$;

-- 4. Free-text settings / template payloads. --------------------------------
-- `settings` (scope=platform, key=general) holds `platform_name`, which the
-- sidebar, footer and page chrome display; `white_label_configs` holds the
-- per-workspace `brand_name` override.
-- These tables are provisioned per-deployment, so each column is discovered
-- rather than assumed. Only text-ish columns are rewritten.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('platform_settings', 'app_settings', 'settings',
                         'white_label_configs', 'white_label_settings',
                         'notification_templates')
      AND data_type IN ('text', 'character varying', 'jsonb', 'json')
  LOOP
    IF c.data_type IN ('jsonb', 'json') THEN
      EXECUTE format(
        'UPDATE %I.%I SET %I = replace(replace(%I::text, %L, %L), %L, %L)::%s
          WHERE %I::text ILIKE %L',
        c.table_schema, c.table_name, c.column_name, c.column_name,
        'Swiffer', 'WACRM', 'swiffer', 'wacrm', c.data_type,
        c.column_name, '%swiffer%');
    ELSE
      EXECUTE format(
        'UPDATE %I.%I SET %I = replace(replace(%I, %L, %L), %L, %L)
          WHERE %I ILIKE %L',
        c.table_schema, c.table_name, c.column_name, c.column_name,
        'Swiffer', 'WACRM', 'swiffer', 'wacrm',
        c.column_name, '%swiffer%');
    END IF;
  END LOOP;
END $$;
