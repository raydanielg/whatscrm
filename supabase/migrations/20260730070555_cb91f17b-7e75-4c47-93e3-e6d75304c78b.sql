-- 1. campaign-media: scope to workspace folder
DROP POLICY IF EXISTS "campaign-media read" ON storage.objects;
DROP POLICY IF EXISTS "campaign-media insert" ON storage.objects;
DROP POLICY IF EXISTS "campaign-media update" ON storage.objects;
DROP POLICY IF EXISTS "campaign-media delete" ON storage.objects;

CREATE POLICY "campaign_media_select_workspace_member" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-media' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()));

CREATE POLICY "campaign_media_insert_workspace_member" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-media' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()));

CREATE POLICY "campaign_media_update_workspace_member" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-media' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()))
  WITH CHECK (bucket_id = 'campaign-media' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()));

CREATE POLICY "campaign_media_delete_workspace_member" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-media' AND ((owner = auth.uid()) OR public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())));

-- 2. workspace_invitations: remove `OR true`
DROP POLICY IF EXISTS "wsinv select members or by token" ON public.workspace_invitations;

CREATE POLICY "wsinv select members or invitee" ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

-- 3. commerce_payment_links: no bulk anon read
DROP POLICY IF EXISTS "payment links public read active" ON public.commerce_payment_links;
REVOKE SELECT ON public.commerce_payment_links FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_payment_link(_token text)
RETURNS TABLE (
  token text,
  provider text,
  amount numeric,
  currency text,
  description text,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.token, l.provider, l.amount, l.currency, l.description, l.status, l.expires_at
  FROM public.commerce_payment_links l
  WHERE l.token = _token
    AND l.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_payment_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_payment_link(text) TO anon, authenticated;