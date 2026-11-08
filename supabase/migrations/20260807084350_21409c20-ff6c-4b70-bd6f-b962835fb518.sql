-- 1) cookie_consents: explicit owner/admin read access (previously no SELECT policy at all)
GRANT SELECT ON public.cookie_consents TO authenticated;

DROP POLICY IF EXISTS "Users can read their own cookie consents" ON public.cookie_consents;
CREATE POLICY "Users can read their own cookie consents"
ON public.cookie_consents
FOR SELECT
TO authenticated
USING (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "Super admins can read cookie consents" ON public.cookie_consents;
CREATE POLICY "Super admins can read cookie consents"
ON public.cookie_consents
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 2) vcard_views: throttle anonymous analytics flooding (max 120 views/minute per card)
CREATE OR REPLACE FUNCTION public.tg_vcard_views_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed boolean;
BEGIN
  SELECT allowed INTO _allowed
  FROM public.enforce_rate_limit('vcard_view:' || NEW.vcard_id::text, 120, 60);

  IF _allowed IS DISTINCT FROM true THEN
    RETURN NULL; -- silently drop the excess view
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vcard_views_rate_limit ON public.vcard_views;
CREATE TRIGGER vcard_views_rate_limit
BEFORE INSERT ON public.vcard_views
FOR EACH ROW EXECUTE FUNCTION public.tg_vcard_views_rate_limit();