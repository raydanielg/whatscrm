-- Expose the configured login loader together with the existing public
-- branding payload. Only active, verified custom domains can resolve it.
DROP FUNCTION IF EXISTS public.get_public_white_label(text);

CREATE FUNCTION public.get_public_white_label(_domain text)
RETURNS TABLE (
  workspace_id uuid,
  brand_name text,
  logo_url text,
  favicon_url text,
  primary_color text,
  accent_color text,
  meta_title text,
  meta_description text,
  login_background_url text,
  login_headline text,
  login_subheadline text,
  login_layout text,
  loader_url text,
  loader_style text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT w.workspace_id, w.brand_name, w.logo_url, w.favicon_url,
         w.primary_color, w.accent_color, w.meta_title, w.meta_description,
         w.login_background_url, w.login_headline, w.login_subheadline, w.login_layout,
         w.loader_url, w.loader_style
  FROM public.white_label_configs AS w
  WHERE w.is_active
    AND w.custom_domain IS NOT NULL
    AND lower(w.custom_domain) = lower(btrim(coalesce(_domain, '')))
    AND coalesce(w.custom_domain_verified, false)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_white_label(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_white_label(text) TO anon, authenticated, service_role;
