-- 1. Lock search_path on helper functions
ALTER FUNCTION public.ai_settings_touch() SET search_path = public;
ALTER FUNCTION public.enforce_single_default_ai_provider() SET search_path = public;
ALTER FUNCTION public.kb_articles_tsv_update() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

-- 2. Explicit deny-all policies for service-role-only tables (RLS on, no policy)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'instagram_oauth_states','messenger_oauth_states',
    'oauth_authorization_codes','oauth_refresh_tokens','webhook_endpoint_secrets'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)',
      t || '_no_client_access', t);
  END LOOP;
END $$;

-- 3. Replace always-true read policies with scoped ones
DROP POLICY IF EXISTS "marketplace catalog is public read" ON public.marketplace_integrations;
CREATE POLICY "marketplace catalog readable when published"
  ON public.marketplace_integrations FOR SELECT TO authenticated, anon
  USING (status IN ('published','active','available'));

DROP POLICY IF EXISTS "Authenticated can read permission catalog" ON public.permissions;
CREATE POLICY "Authenticated can read permission catalog"
  ON public.permissions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "plugin_categories public read" ON public.plugin_categories;
CREATE POLICY "plugin_categories public read"
  ON public.plugin_categories FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "plugin_reviews public read" ON public.plugin_reviews;
CREATE POLICY "plugin_reviews public read"
  ON public.plugin_reviews FOR SELECT TO authenticated, anon
  USING (true);

-- 4. vcard_views: only allow logging a view for an existing vcard
DROP POLICY IF EXISTS "vcard views insert" ON public.vcard_views;
CREATE POLICY "vcard views insert"
  ON public.vcard_views FOR INSERT TO authenticated, anon
  WITH CHECK (EXISTS (SELECT 1 FROM public.vcards v WHERE v.id = vcard_id));