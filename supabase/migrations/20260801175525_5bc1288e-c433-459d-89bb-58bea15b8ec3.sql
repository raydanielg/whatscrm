DROP POLICY IF EXISTS "white_label custom domain public lookup" ON public.white_label_configs;
REVOKE SELECT ON public.white_label_configs FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_white_label(_domain text)
RETURNS TABLE (
  workspace_id uuid,
  brand_name text,
  logo_url text,
  favicon_url text,
  primary_color text,
  accent_color text,
  meta_title text,
  meta_description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.workspace_id, w.brand_name, w.logo_url, w.favicon_url,
         w.primary_color, w.accent_color, w.meta_title, w.meta_description
  FROM public.white_label_configs w
  WHERE w.is_active
    AND w.custom_domain IS NOT NULL
    AND lower(w.custom_domain) = lower(btrim(coalesce(_domain, '')))
    AND coalesce(w.custom_domain_verified, false)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_white_label(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_white_label(text) TO anon, authenticated, service_role;