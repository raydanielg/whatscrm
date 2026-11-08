-- 1. Dedicated schema for extensions (already present on Supabase, kept idempotent)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 2. Move extensions out of the public API surface.
--    Existing columns, indexes, opclasses and exclusion constraints keep working:
--    they reference the underlying objects by OID, not by schema name.
ALTER EXTENSION vector SET SCHEMA extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;

-- 3. Repoint any non-extension function that referenced these through public.*
--    or relied on operator lookup (<=>, <->, <#>, %) via search_path = public.
DO $rewrite$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    def := r.def;

    IF def ~ 'public\.(similarity|word_similarity|strict_word_similarity|show_trgm|l2_distance|cosine_distance|inner_product|l1_distance|l2_norm|l2_normalize|vector_dims|binary_quantize|subvector)\s*\('
       OR def ~ '<=>|<->|<#>|<\+>|<~>'
    THEN
      def := regexp_replace(
        def,
        'public\.(similarity|word_similarity|strict_word_similarity|show_trgm|l2_distance|cosine_distance|inner_product|l1_distance|l2_norm|l2_normalize|vector_dims|binary_quantize|subvector)\s*\(',
        'extensions.\1(',
        'g'
      );

      IF def ~* 'SET search_path' THEN
        def := regexp_replace(
          def,
          'SET search_path TO ''public''',
          'SET search_path TO ''public'', ''extensions''',
          'i'
        );
        def := regexp_replace(
          def,
          'SET search_path TO public(\s)',
          'SET search_path TO public, extensions\1',
          'i'
        );
      END IF;

      EXECUTE def;
      RAISE NOTICE 'rewired function %', r.proname;
    END IF;
  END LOOP;
END
$rewrite$;

-- 4. Make the extensions schema resolvable by default for app roles,
--    so ad-hoc casts such as '[0.1,0.2]'::vector keep resolving.
DO $sp$
DECLARE
  rolename text;
BEGIN
  FOREACH rolename IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator', 'postgres']
  LOOP
    BEGIN
      EXECUTE format('ALTER ROLE %I SET search_path = public, extensions', rolename);
    EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
      RAISE NOTICE 'skipped search_path update for role %', rolename;
    END;
  END LOOP;
END
$sp$;