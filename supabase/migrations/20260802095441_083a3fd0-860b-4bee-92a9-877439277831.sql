-- ============================ EMAIL ACCOUNTS ============================
CREATE TABLE public.email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'lovable',
  display_name text NOT NULL,
  from_email text NOT NULL,
  from_name text,
  reply_to text,
  inbound_address text,
  status text NOT NULL DEFAULT 'pending',
  status_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz NOT NULL DEFAULT now(),
  connected_by uuid,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_accounts_provider_chk CHECK (provider IN ('lovable', 'smtp')),
  CONSTRAINT email_accounts_status_chk CHECK (status IN ('pending', 'connected', 'error', 'disconnected', 'suspended'))
);

CREATE UNIQUE INDEX email_accounts_workspace_from_email_key
  ON public.email_accounts (workspace_id, lower(from_email));
CREATE UNIQUE INDEX email_accounts_inbound_address_key
  ON public.email_accounts (lower(inbound_address)) WHERE inbound_address IS NOT NULL;
CREATE INDEX email_accounts_workspace_idx ON public.email_accounts (workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_accounts TO authenticated;
GRANT ALL ON public.email_accounts TO service_role;

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read email accounts"
  ON public.email_accounts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage email accounts"
  ON public.email_accounts FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER email_accounts_touch_updated_at
  BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================= SMS ACCOUNTS =============================
CREATE TABLE public.sms_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'twilio',
  display_name text NOT NULL,
  phone_number text NOT NULL,
  phone_digits text GENERATED ALWAYS AS (regexp_replace(phone_number, '\D', '', 'g')) STORED,
  account_sid text,
  auth_token_ciphertext text,
  webhook_secret text,
  status text NOT NULL DEFAULT 'pending',
  status_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz NOT NULL DEFAULT now(),
  connected_by uuid,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_accounts_provider_chk CHECK (provider IN ('twilio', 'messagebird', 'vonage', 'custom')),
  CONSTRAINT sms_accounts_status_chk CHECK (status IN ('pending', 'connected', 'error', 'disconnected', 'suspended'))
);

CREATE UNIQUE INDEX sms_accounts_provider_number_key
  ON public.sms_accounts (provider, phone_digits);
CREATE INDEX sms_accounts_workspace_idx ON public.sms_accounts (workspace_id);
CREATE INDEX sms_accounts_digits_idx ON public.sms_accounts (phone_digits);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_accounts TO authenticated;
GRANT ALL ON public.sms_accounts TO service_role;

ALTER TABLE public.sms_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read sms accounts"
  ON public.sms_accounts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage sms accounts"
  ON public.sms_accounts FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER sms_accounts_touch_updated_at
  BEFORE UPDATE ON public.sms_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();