CREATE TABLE IF NOT EXISTS public.webhook_verify_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'whatsapp_cloud',
  token text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

GRANT SELECT, INSERT, DELETE ON public.webhook_verify_tokens TO authenticated;
GRANT ALL ON public.webhook_verify_tokens TO service_role;

ALTER TABLE public.webhook_verify_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wvt_members_read" ON public.webhook_verify_tokens;
CREATE POLICY "wvt_members_read" ON public.webhook_verify_tokens
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "wvt_members_insert" ON public.webhook_verify_tokens;
CREATE POLICY "wvt_members_insert" ON public.webhook_verify_tokens
FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS "wvt_members_delete" ON public.webhook_verify_tokens;
CREATE POLICY "wvt_members_delete" ON public.webhook_verify_tokens
FOR DELETE TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS webhook_verify_tokens_provider_idx ON public.webhook_verify_tokens (provider, token);