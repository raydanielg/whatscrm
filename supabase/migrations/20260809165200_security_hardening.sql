-- Hardening RLS for vcard_views
--
-- Corrected 2026-09-22: this policy referenced public.vcards.status and
-- public.vcards.owner_id, neither of which has ever existed — no migration
-- creates them, and the table (20260728154545) defines is_public / created_by
-- instead. As written the statement raised 42703 "column \"status\" does not
-- exist", so this file could never apply to a clean database and every fresh
-- install aborted here. Rewritten against the real columns, preserving intent:
-- a view may be recorded for a publicly visible card, or by its own creator.
-- `revoked_at IS NULL` is included because a revoked card is not live.
DROP POLICY IF EXISTS "vcard views insert" ON public.vcard_views;
CREATE POLICY "vcard views insert" ON public.vcard_views
FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vcards
    WHERE id = vcard_id
    AND ((is_public = true AND revoked_at IS NULL) OR created_by = auth.uid())
  )
);

-- Ensure search_path is set on all SECURITY DEFINER functions to prevent hijacking
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION public.create_workspace_with_owner(text, text, uuid, text) SET search_path = public;
-- Add other identified security definer functions if they exist

GRANT INSERT ON public.vcard_views TO anon, authenticated;
GRANT ALL ON public.vcard_views TO service_role;
