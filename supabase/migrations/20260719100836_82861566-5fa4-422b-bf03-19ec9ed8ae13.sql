
-- ============ LICENSES ============
CREATE TABLE public.plugin_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL UNIQUE,
  plugin_id UUID NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  publisher_id UUID,
  customer_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  customer_user_id UUID,
  license_type TEXT NOT NULL DEFAULT 'perpetual', -- perpetual | subscription | trial | free
  status TEXT NOT NULL DEFAULT 'active',          -- active | expired | revoked | suspended
  seats INT NOT NULL DEFAULT 1,
  seats_used INT NOT NULL DEFAULT 0,
  price_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plugin_licenses_plugin_idx ON public.plugin_licenses(plugin_id);
CREATE INDEX plugin_licenses_workspace_idx ON public.plugin_licenses(customer_workspace_id);
CREATE INDEX plugin_licenses_publisher_idx ON public.plugin_licenses(publisher_id);
CREATE INDEX plugin_licenses_status_idx ON public.plugin_licenses(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_licenses TO authenticated;
GRANT ALL ON public.plugin_licenses TO service_role;
ALTER TABLE public.plugin_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read their licenses" ON public.plugin_licenses
  FOR SELECT TO authenticated USING (customer_user_id = auth.uid());
CREATE POLICY "Publishers read their licenses" ON public.plugin_licenses
  FOR SELECT TO authenticated USING (publisher_id = auth.uid());
CREATE POLICY "Publishers manage their licenses" ON public.plugin_licenses
  FOR ALL TO authenticated USING (publisher_id = auth.uid()) WITH CHECK (publisher_id = auth.uid());

-- ============ ACTIVATIONS ============
CREATE TABLE public.plugin_license_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.plugin_licenses(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  installation_id UUID REFERENCES public.plugin_installations(id) ON DELETE SET NULL,
  activated_by UUID,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  device_fingerprint TEXT,
  UNIQUE (license_id, workspace_id)
);
CREATE INDEX plugin_license_activations_license_idx ON public.plugin_license_activations(license_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_license_activations TO authenticated;
GRANT ALL ON public.plugin_license_activations TO service_role;
ALTER TABLE public.plugin_license_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read activations for their workspace" ON public.plugin_license_activations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = plugin_license_activations.workspace_id AND m.user_id = auth.uid())
  );

-- ============ PURCHASES ============
CREATE TABLE public.plugin_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  license_id UUID REFERENCES public.plugin_licenses(id) ON DELETE SET NULL,
  buyer_user_id UUID,
  buyer_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  publisher_id UUID,
  amount_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_cents INT NOT NULL DEFAULT 0,
  fee_cents INT NOT NULL DEFAULT 0,
  net_cents INT NOT NULL DEFAULT 0,
  gateway TEXT,                     -- stripe | paddle | manual
  gateway_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | refunded | failed
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refunded_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plugin_purchases_plugin_idx ON public.plugin_purchases(plugin_id);
CREATE INDEX plugin_purchases_publisher_idx ON public.plugin_purchases(publisher_id);
CREATE INDEX plugin_purchases_buyer_idx ON public.plugin_purchases(buyer_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_purchases TO authenticated;
GRANT ALL ON public.plugin_purchases TO service_role;
ALTER TABLE public.plugin_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer reads purchases" ON public.plugin_purchases
  FOR SELECT TO authenticated USING (buyer_user_id = auth.uid());
CREATE POLICY "Publisher reads sales" ON public.plugin_purchases
  FOR SELECT TO authenticated USING (publisher_id = auth.uid());

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.plugin_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.plugin_licenses(id) ON DELETE CASCADE,
  plugin_id UUID NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  interval TEXT NOT NULL DEFAULT 'month',    -- month | year | week
  interval_count INT NOT NULL DEFAULT 1,
  amount_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',     -- active | past_due | cancelled | trialing
  gateway TEXT,
  gateway_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plugin_subscriptions_license_idx ON public.plugin_subscriptions(license_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_subscriptions TO authenticated;
GRANT ALL ON public.plugin_subscriptions TO service_role;
ALTER TABLE public.plugin_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read subscription via license" ON public.plugin_subscriptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.plugin_licenses l WHERE l.id = plugin_subscriptions.license_id AND (l.customer_user_id = auth.uid() OR l.publisher_id = auth.uid()))
  );

-- ============ TRIALS ============
CREATE TABLE public.plugin_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID,
  trial_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_end TIMESTAMPTZ NOT NULL,
  converted_license_id UUID REFERENCES public.plugin_licenses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',    -- active | expired | converted | abandoned
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plugin_id, workspace_id)
);
CREATE INDEX plugin_trials_workspace_idx ON public.plugin_trials(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_trials TO authenticated;
GRANT ALL ON public.plugin_trials TO service_role;
ALTER TABLE public.plugin_trials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace trials" ON public.plugin_trials
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = plugin_trials.workspace_id AND m.user_id = auth.uid())
  );

-- ============ USAGE ============
CREATE TABLE public.plugin_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES public.plugin_licenses(id) ON DELETE CASCADE,
  plugin_id UUID NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plugin_usage_events_license_idx ON public.plugin_usage_events(license_id, occurred_at DESC);
CREATE INDEX plugin_usage_events_plugin_idx ON public.plugin_usage_events(plugin_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.plugin_usage_events TO authenticated;
GRANT ALL ON public.plugin_usage_events TO service_role;
ALTER TABLE public.plugin_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members insert usage for workspace" ON public.plugin_usage_events
  FOR INSERT TO authenticated WITH CHECK (
    workspace_id IS NULL OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = plugin_usage_events.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "Publishers read usage for their plugin" ON public.plugin_usage_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.plugins p WHERE p.id = plugin_usage_events.plugin_id AND p.publisher_id = auth.uid())
  );

-- ============ DOWNLOADS ============
CREATE TABLE public.plugin_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.plugin_versions(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id UUID,
  ip_hash TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plugin_downloads_plugin_idx ON public.plugin_downloads(plugin_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.plugin_downloads TO authenticated;
GRANT ALL ON public.plugin_downloads TO service_role;
ALTER TABLE public.plugin_downloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in logs downloads" ON public.plugin_downloads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Publishers read downloads" ON public.plugin_downloads
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.plugins p WHERE p.id = plugin_downloads.plugin_id AND p.publisher_id = auth.uid())
  );

-- ============ REVENUE SHARES ============
CREATE TABLE public.plugin_revenue_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.plugin_purchases(id) ON DELETE CASCADE,
  plugin_id UUID NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  publisher_id UUID,
  gross_cents INT NOT NULL DEFAULT 0,
  platform_fee_cents INT NOT NULL DEFAULT 0,
  publisher_share_cents INT NOT NULL DEFAULT 0,
  share_bps INT NOT NULL DEFAULT 7000, -- 70.00% default to publisher
  currency TEXT NOT NULL DEFAULT 'USD',
  payout_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | reversed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plugin_revenue_shares_publisher_idx ON public.plugin_revenue_shares(publisher_id);
GRANT SELECT, INSERT, UPDATE ON public.plugin_revenue_shares TO authenticated;
GRANT ALL ON public.plugin_revenue_shares TO service_role;
ALTER TABLE public.plugin_revenue_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Publisher reads own shares" ON public.plugin_revenue_shares
  FOR SELECT TO authenticated USING (publisher_id = auth.uid());

-- ============ PAYOUTS ============
CREATE TABLE public.plugin_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | processing | paid | failed
  gateway TEXT,
  gateway_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plugin_payouts_publisher_idx ON public.plugin_payouts(publisher_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.plugin_payouts TO authenticated;
GRANT ALL ON public.plugin_payouts TO service_role;
ALTER TABLE public.plugin_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Publisher reads own payouts" ON public.plugin_payouts
  FOR SELECT TO authenticated USING (publisher_id = auth.uid());

-- updated_at triggers
CREATE TRIGGER trg_plugin_licenses_updated BEFORE UPDATE ON public.plugin_licenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_plugin_subscriptions_updated BEFORE UPDATE ON public.plugin_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
