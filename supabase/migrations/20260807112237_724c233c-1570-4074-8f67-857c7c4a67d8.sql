DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'target_platform'
      AND c.column_default ILIKE '%wadiff%'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN target_platform SET DEFAULT %L', t.table_schema, t.table_name, 'swiffer');
    EXECUTE format('UPDATE %I.%I SET target_platform = %L WHERE target_platform = %L', t.table_schema, t.table_name, 'swiffer', 'wadiff');
  END LOOP;
END $$;

DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'wadiff-%'
  LOOP
    PERFORM cron.unschedule(j.jobname);
    PERFORM cron.schedule(replace(j.jobname, 'wadiff-', 'swiffer-'), j.schedule, j.command);
  END LOOP;
END $$;