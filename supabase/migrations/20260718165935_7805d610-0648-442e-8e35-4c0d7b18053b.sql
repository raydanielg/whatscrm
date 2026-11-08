
-- Channel identities: per-channel handle -> contact
CREATE TABLE public.channel_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  channel text NOT NULL,
  external_id text NOT NULL,
  display_name text,
  avatar_url text,
  verified boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel, external_id)
);
CREATE INDEX idx_channel_identities_contact ON public.channel_identities(contact_id);
CREATE INDEX idx_channel_identities_ws ON public.channel_identities(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_identities TO authenticated;
GRANT ALL ON public.channel_identities TO service_role;
ALTER TABLE public.channel_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read channel_identities"
  ON public.channel_identities FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ws members write channel_identities"
  ON public.channel_identities FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Identity merges: audit + reversible
CREATE TABLE public.identity_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  primary_contact_id uuid NOT NULL,
  merged_contact_id uuid NOT NULL,
  merged_snapshot jsonb NOT NULL,
  moved_identity_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  merge_reason text,
  merged_by uuid,
  is_reverted boolean NOT NULL DEFAULT false,
  reverted_at timestamptz,
  reverted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_identity_merges_ws ON public.identity_merges(workspace_id);
CREATE INDEX idx_identity_merges_primary ON public.identity_merges(primary_contact_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.identity_merges TO authenticated;
GRANT ALL ON public.identity_merges TO service_role;
ALTER TABLE public.identity_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read identity_merges"
  ON public.identity_merges FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ws admins write identity_merges"
  ON public.identity_merges FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'agent'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'agent'::workspace_role]));

-- Per-workspace config
CREATE TABLE public.identity_engine_config (
  workspace_id uuid PRIMARY KEY,
  auto_merge_on_phone boolean NOT NULL DEFAULT true,
  auto_merge_on_email boolean NOT NULL DEFAULT true,
  ai_matching_enabled boolean NOT NULL DEFAULT false,
  ai_confidence_threshold numeric NOT NULL DEFAULT 0.85,
  duplicate_scan_window_days integer NOT NULL DEFAULT 90,
  require_manual_approval boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.identity_engine_config TO authenticated;
GRANT ALL ON public.identity_engine_config TO service_role;
ALTER TABLE public.identity_engine_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read identity_engine_config"
  ON public.identity_engine_config FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ws admins write identity_engine_config"
  ON public.identity_engine_config FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_channel_identities_updated
  BEFORE UPDATE ON public.channel_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_identity_engine_config_updated
  BEFORE UPDATE ON public.identity_engine_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
