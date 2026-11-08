
-- ============================================================
-- Phase 12: Billing core schema
-- ============================================================

-- Billing customers: per-org, per-provider customer record
CREATE TABLE public.billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_customer_id text NOT NULL,
  email text,
  name text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_id text,
  currency text NOT NULL DEFAULT 'USD',
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_customer_id),
  UNIQUE (organization_id, provider)
);
CREATE INDEX idx_billing_customers_org ON public.billing_customers(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_customers TO authenticated;
GRANT ALL ON public.billing_customers TO service_role;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view billing customers" ON public.billing_customers
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Billing admins manage billing customers" ON public.billing_customers
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]));

CREATE TRIGGER trg_billing_customers_updated_at
  BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Payment methods
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  billing_customer_id uuid REFERENCES public.billing_customers(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_payment_method_id text NOT NULL,
  type text NOT NULL DEFAULT 'card',
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_method_id)
);
CREATE INDEX idx_payment_methods_org ON public.payment_methods(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view payment methods" ON public.payment_methods
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Billing admins manage payment methods" ON public.payment_methods
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]));

CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Usage meters: definitions of billable metrics
CREATE TABLE public.usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'count',
  aggregation text NOT NULL DEFAULT 'sum',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.usage_meters TO authenticated;
GRANT ALL ON public.usage_meters TO service_role;
ALTER TABLE public.usage_meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active meters" ON public.usage_meters
  FOR SELECT TO authenticated USING (is_active = true);

CREATE TRIGGER trg_usage_meters_updated_at
  BEFORE UPDATE ON public.usage_meters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Usage events: raw metered records
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meter_code text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, meter_code, idempotency_key)
);
CREATE INDEX idx_usage_events_org_meter_time ON public.usage_events(organization_id, meter_code, occurred_at DESC);

GRANT SELECT, INSERT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view usage events" ON public.usage_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Members insert usage events" ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

-- Tenant quotas: current-period counters
CREATE TABLE public.tenant_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meter_code text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  used numeric NOT NULL DEFAULT 0,
  included numeric NOT NULL DEFAULT 0,
  hard_limit numeric,
  overage_unit_price_cents integer,
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, meter_code, period_start)
);
CREATE INDEX idx_tenant_quotas_org ON public.tenant_quotas(organization_id);

GRANT SELECT ON public.tenant_quotas TO authenticated;
GRANT ALL ON public.tenant_quotas TO service_role;
ALTER TABLE public.tenant_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view quotas" ON public.tenant_quotas
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TRIGGER trg_tenant_quotas_updated_at
  BEFORE UPDATE ON public.tenant_quotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Tax rates
CREATE TABLE public.tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country text,
  region text,
  rate_percent numeric NOT NULL,
  inclusive boolean NOT NULL DEFAULT false,
  provider_tax_rate_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tax_rates TO authenticated;
GRANT ALL ON public.tax_rates TO service_role;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read active tax rates" ON public.tax_rates
  FOR SELECT TO authenticated USING (is_active = true);

CREATE TRIGGER trg_tax_rates_updated_at
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percent',
  amount_off_cents integer,
  percent_off numeric,
  currency text NOT NULL DEFAULT 'USD',
  duration text NOT NULL DEFAULT 'once',
  duration_in_months integer,
  max_redemptions integer,
  times_redeemed integer NOT NULL DEFAULT 0,
  redeem_by timestamptz,
  applies_to_plan_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  provider_coupon_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read active coupons" ON public.coupons
  FOR SELECT TO authenticated USING (is_active = true);

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Billing events audit log
CREATE TABLE public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_type text NOT NULL,
  provider_event_id text,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX idx_billing_events_org ON public.billing_events(organization_id, created_at DESC);

GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Billing admins view events" ON public.billing_events
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role])
  );

-- Seed core usage meters
INSERT INTO public.usage_meters (code, name, unit, aggregation, description) VALUES
  ('messages_sent',    'Messages Sent',    'count',  'sum', 'Outbound WhatsApp messages'),
  ('ai_tokens',        'AI Tokens',        'tokens', 'sum', 'AI Gateway token usage'),
  ('seats',            'Seats',            'count',  'max', 'Active user seats'),
  ('storage_bytes',    'Storage',          'bytes',  'max', 'Media/document storage'),
  ('automation_runs',  'Automation Runs',  'count',  'sum', 'Workflow execution count'),
  ('campaigns_sent',   'Campaigns Sent',   'count',  'sum', 'Marketing campaign dispatches')
ON CONFLICT (code) DO NOTHING;
