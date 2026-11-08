-- 1. Harden vcard_views RLS to prevent unauthorized anonymous writes
DROP POLICY IF EXISTS "vcard views insert" ON public.vcard_views;

CREATE POLICY "vcard views insert" ON public.vcard_views
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vcards
    WHERE id = vcard_id
    AND (is_public = true OR (auth.uid() IS NOT NULL AND created_by = auth.uid()))
  )
);

-- 2. Protect SECURITY DEFINER functions from search-path hijacking
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION public.create_workspace_with_owner(text, text, uuid, text) SET search_path = public;

-- Verify grants
GRANT SELECT, INSERT ON public.vcard_views TO authenticated;
GRANT INSERT ON public.vcard_views TO anon;
GRANT ALL ON public.vcard_views TO service_role;
