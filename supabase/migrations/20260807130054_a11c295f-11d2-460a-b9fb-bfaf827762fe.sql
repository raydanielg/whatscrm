-- billing_documents: restrict UPDATE/DELETE to owner/admin/billing roles
DROP POLICY IF EXISTS "org members update documents" ON public.billing_documents;
DROP POLICY IF EXISTS "org members delete documents" ON public.billing_documents;

CREATE POLICY "billing_documents_update_privileged" ON public.billing_documents
FOR UPDATE TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','billing']::org_role[])
)
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','billing']::org_role[])
);

CREATE POLICY "billing_documents_delete_privileged" ON public.billing_documents
FOR DELETE TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','billing']::org_role[])
);

-- ticket_mentions: add WITH CHECK so users cannot reassign their own mentions
DROP POLICY IF EXISTS "mentions_update_own" ON public.ticket_mentions;

CREATE POLICY "mentions_update_own" ON public.ticket_mentions
FOR UPDATE TO authenticated
USING (mentioned_user_id = auth.uid())
WITH CHECK (
  mentioned_user_id = auth.uid()
  AND workspace_id IN (
    SELECT workspace_members.workspace_id
    FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
  )
);