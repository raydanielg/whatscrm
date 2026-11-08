
-- ============================================================================
-- MESSAGING PROVIDER LAYER — multi-tenant, multi-account, provider-agnostic
-- ============================================================================

-- Provider enum (extensible)
DO $$ BEGIN
  CREATE TYPE public.messaging_provider AS ENUM ('whatsapp_cloud','twilio','dialog360','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.channel_account_status AS ENUM ('pending','connected','disconnected','error','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outbox_status AS ENUM ('queued','processing','sent','delivered','read','failed','dead_letter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wa_template_status AS ENUM ('draft','pending','approved','rejected','paused','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- channel_accounts: one row per connected WhatsApp Business Account phone number
-- (or per external provider phone id). Multiple accounts per workspace supported.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  inbox_id uuid REFERENCES public.inboxes(id) ON DELETE SET NULL,
  provider public.messaging_provider NOT NULL DEFAULT 'whatsapp_cloud',
  display_name text NOT NULL,
  phone_number text,
  phone_number_id text,             -- Meta phone_number_id
  waba_id text,                     -- WhatsApp Business Account id
  business_id text,                 -- Meta Business id
  external_account_id text,         -- generic external account reference
  -- Secrets are stored as secret NAMES; the actual value lives in edge secrets.
  access_token_secret_name text,    -- e.g. WA_ACCESS_TOKEN_<accountid>
  app_secret_name text,             -- optional per-account app secret name
  verify_token text,                -- webhook verify token (per-account)
  webhook_signature_algo text NOT NULL DEFAULT 'sha256',
  status public.channel_account_status NOT NULL DEFAULT 'pending',
  status_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, phone_number_id),
  UNIQUE (provider, external_account_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_accounts_ws ON public.channel_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_channel_accounts_inbox ON public.channel_accounts(inbox_id);
CREATE INDEX IF NOT EXISTS idx_channel_accounts_provider ON public.channel_accounts(provider, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_accounts TO authenticated;
GRANT ALL ON public.channel_accounts TO service_role;
ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_accounts: workspace members read"
  ON public.channel_accounts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "channel_accounts: admins manage"
  ON public.channel_accounts FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_channel_accounts_updated
  BEFORE UPDATE ON public.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- message_outbox: outbound queue. Producers insert; workers pick with SKIP LOCKED.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  provider public.messaging_provider NOT NULL,
  to_address text NOT NULL,
  payload jsonb NOT NULL,          -- normalized send payload (text/media/template/interactive)
  idempotency_key text,
  status public.outbox_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  external_message_id text,        -- wamid from Meta / provider msg id
  last_error text,
  last_error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_account_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_outbox_due
  ON public.message_outbox(next_attempt_at)
  WHERE status IN ('queued','processing');
CREATE INDEX IF NOT EXISTS idx_outbox_ws_status ON public.message_outbox(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_account_status ON public.message_outbox(channel_account_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_external ON public.message_outbox(external_message_id) WHERE external_message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_outbox TO authenticated;
GRANT ALL ON public.message_outbox TO service_role;
ALTER TABLE public.message_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbox: workspace members read"
  ON public.message_outbox FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "outbox: workspace members insert"
  ON public.message_outbox FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_outbox_updated
  BEFORE UPDATE ON public.message_outbox
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- webhook_events: raw inbound webhook envelopes for audit + async processing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.messaging_provider NOT NULL,
  channel_account_id uuid REFERENCES public.channel_accounts(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  event_type text NOT NULL,        -- message | status | template | error | unknown
  external_event_id text,          -- Meta message/status id where present
  signature_valid boolean NOT NULL DEFAULT false,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  process_error text,
  attempts int NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed
  ON public.webhook_events(received_at) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_webhook_events_account ON public.webhook_events(channel_account_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_external ON public.webhook_events(external_event_id) WHERE external_event_id IS NOT NULL;

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events: workspace admins read"
  ON public.webhook_events FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_webhook_events_updated
  BEFORE UPDATE ON public.webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- provider_media_cache: dedupe media downloads. media_id -> storage path.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_media_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.messaging_provider NOT NULL,
  channel_account_id uuid REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  external_media_id text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'attachments',
  storage_path text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  status text NOT NULL DEFAULT 'pending', -- pending | ready | failed
  error text,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_media_id)
);
CREATE INDEX IF NOT EXISTS idx_media_cache_account ON public.provider_media_cache(channel_account_id);

GRANT SELECT ON public.provider_media_cache TO authenticated;
GRANT ALL ON public.provider_media_cache TO service_role;
ALTER TABLE public.provider_media_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_cache: workspace members read"
  ON public.provider_media_cache FOR SELECT TO authenticated
  USING (
    channel_account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.channel_accounts ca
      WHERE ca.id = channel_account_id
        AND public.is_workspace_member(ca.workspace_id, auth.uid())
    )
  );

CREATE TRIGGER trg_media_cache_updated
  BEFORE UPDATE ON public.provider_media_cache
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- wa_templates: registered/synchronized message templates per WABA.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  provider public.messaging_provider NOT NULL DEFAULT 'whatsapp_cloud',
  external_template_id text,
  name text NOT NULL,
  language text NOT NULL,
  category text NOT NULL,           -- MARKETING | UTILITY | AUTHENTICATION
  status public.wa_template_status NOT NULL DEFAULT 'draft',
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  quality_score text,
  last_synced_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_account_id, name, language)
);
CREATE INDEX IF NOT EXISTS idx_wa_templates_ws ON public.wa_templates(workspace_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_templates TO authenticated;
GRANT ALL ON public.wa_templates TO service_role;
ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_templates: workspace members read"
  ON public.wa_templates FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "wa_templates: admins manage"
  ON public.wa_templates FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_wa_templates_updated
  BEFORE UPDATE ON public.wa_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- provider_logs: structured logs (auditable, workspace-scoped).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_account_id uuid REFERENCES public.channel_accounts(id) ON DELETE SET NULL,
  provider public.messaging_provider,
  level text NOT NULL DEFAULT 'info',   -- debug | info | warn | error
  scope text NOT NULL,                  -- webhook | send | media | template | status | sync
  message text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_logs_ws_time ON public.provider_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_logs_corr ON public.provider_logs(correlation_id) WHERE correlation_id IS NOT NULL;

GRANT SELECT ON public.provider_logs TO authenticated;
GRANT ALL ON public.provider_logs TO service_role;
ALTER TABLE public.provider_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_logs: workspace admins read"
  ON public.provider_logs FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

-- ---------------------------------------------------------------------------
-- Helper: dequeue outbox with SKIP LOCKED (worker safe, multi-consumer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.outbox_claim_batch(_worker text, _limit int DEFAULT 25)
RETURNS SETOF public.message_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.message_outbox
    WHERE status = 'queued' AND next_attempt_at <= now()
    ORDER BY next_attempt_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.message_outbox o
     SET status = 'processing',
         attempts = o.attempts + 1,
         locked_at = now(),
         locked_by = _worker,
         updated_at = now()
    FROM claimed
   WHERE o.id = claimed.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.outbox_claim_batch(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outbox_claim_batch(text, int) TO service_role;

-- Extend conversations/messages with provider linkage (idempotent)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel_account_id uuid REFERENCES public.channel_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_channel_account ON public.conversations(channel_account_id);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS external_message_id text,
  ADD COLUMN IF NOT EXISTS provider public.messaging_provider;
CREATE INDEX IF NOT EXISTS idx_messages_external ON public.messages(external_message_id) WHERE external_message_id IS NOT NULL;
