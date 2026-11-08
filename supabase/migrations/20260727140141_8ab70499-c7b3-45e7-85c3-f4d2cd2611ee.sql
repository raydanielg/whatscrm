CREATE OR REPLACE FUNCTION public.rls_harness_list_scoped_tables()
RETURNS TABLE(table_name text, scope_column text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.table_name::text,
         CASE
           WHEN bool_or(c.column_name = 'workspace_id') THEN 'workspace_id'
           ELSE 'organization_id'
         END AS scope_column
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   WHERE c.table_schema = 'public'
     AND t.table_type = 'BASE TABLE'
     AND c.column_name IN ('workspace_id', 'organization_id')
   GROUP BY c.table_name
   ORDER BY c.table_name;
$$;

REVOKE ALL ON FUNCTION public.rls_harness_list_scoped_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_harness_list_scoped_tables() TO service_role;