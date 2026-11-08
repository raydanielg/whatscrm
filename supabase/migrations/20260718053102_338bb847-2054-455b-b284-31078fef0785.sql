
DO $$ BEGIN CREATE TYPE public.billing_invoice_status AS ENUM ('draft','open','paid','void','uncollectible','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.billing_payment_attempt_status AS ENUM ('pending','processing','succeeded','failed','canceled','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.billing_notification_kind AS ENUM ('invoice.issued','invoice.paid','invoice.payment_failed','invoice.upcoming','subscription.trial_ending','subscription.canceled','subscription.renewed','quota.approaching','quota.exceeded','payment_method.expiring'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.billing_notification_status AS ENUM ('pending','sent','failed','skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  provider text, provider_invoice_id text, number text,
  status public.billing_invoice_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'USD',
  subtotal_cents integer NOT NULL DEFAULT 0, discount_cents integer NOT NULL DEFAULT 0,
  tax_cents integer NOT NULL DEFAULT 0, total_cents integer NOT NULL DEFAULT 0,
  amount_paid_cents integer NOT NULL DEFAULT 0, amount_due_cents integer NOT NULL DEFAULT 0,
  period_start timestamptz, period_end timestamptz,
  due_at timestamptz, issued_at timestamptz, paid_at timestamptz, voided_at timestamptz,
  hosted_url text, pdf_url text,
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  tax_rate_id uuid REFERENCES public.tax_rates(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_org ON public.billing_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON public.billing_invoices(status) WHERE status IN ('open','draft');
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT ALL ON public.billing_invoices TO service_role;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_invoices" ON public.billing_invoices FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.billing_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  unit_amount_cents integer NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL DEFAULT 0,
  meter_code text, period_start timestamptz, period_end timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_invoice ON public.billing_invoice_items(invoice_id);
GRANT SELECT ON public.billing_invoice_items TO authenticated;
GRANT ALL ON public.billing_invoice_items TO service_role;
ALTER TABLE public.billing_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_invoice_items" ON public.billing_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.billing_invoices bi WHERE bi.id = invoice_id AND public.is_org_member(bi.organization_id, auth.uid())));

CREATE TABLE IF NOT EXISTS public.billing_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_payment_id text, provider_intent_id text,
  amount_cents integer NOT NULL, currency text NOT NULL DEFAULT 'USD',
  status public.billing_payment_attempt_status NOT NULL DEFAULT 'pending',
  failure_code text, failure_message text,
  retry_count integer NOT NULL DEFAULT 0, next_retry_at timestamptz,
  succeeded_at timestamptz, refunded_at timestamptz,
  refunded_amount_cents integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_pay_attempts_org ON public.billing_payment_attempts(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_pay_attempts_invoice ON public.billing_payment_attempts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_pay_attempts_retry ON public.billing_payment_attempts(next_retry_at) WHERE status = 'failed';
GRANT SELECT ON public.billing_payment_attempts TO authenticated;
GRANT ALL ON public.billing_payment_attempts TO service_role;
ALTER TABLE public.billing_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_payments" ON public.billing_payment_attempts FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.billing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.billing_notification_kind NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  recipient text, subject text, body text,
  status public.billing_notification_status NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz, error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_invoice_id uuid REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  related_subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_billing_notif_pending ON public.billing_notifications(scheduled_for) WHERE status = 'pending';
GRANT SELECT ON public.billing_notifications TO authenticated;
GRANT ALL ON public.billing_notifications TO service_role;
ALTER TABLE public.billing_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_admins_read_notifications" ON public.billing_notifications FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE TABLE IF NOT EXISTS public.billing_revenue_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  mrr_cents bigint NOT NULL DEFAULT 0, arr_cents bigint NOT NULL DEFAULT 0,
  active_subscriptions integer NOT NULL DEFAULT 0,
  trialing_subscriptions integer NOT NULL DEFAULT 0,
  new_subscriptions integer NOT NULL DEFAULT 0,
  churned_subscriptions integer NOT NULL DEFAULT 0,
  churn_rate numeric(6,4) NOT NULL DEFAULT 0,
  gross_revenue_cents bigint NOT NULL DEFAULT 0,
  refunds_cents bigint NOT NULL DEFAULT 0,
  net_revenue_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, snapshot_date, currency)
);
GRANT SELECT ON public.billing_revenue_snapshots TO authenticated;
GRANT ALL ON public.billing_revenue_snapshots TO service_role;
ALTER TABLE public.billing_revenue_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_admins_read_revenue" ON public.billing_revenue_snapshots FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE TRIGGER trg_billing_invoices_updated BEFORE UPDATE ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_billing_pay_attempts_updated BEFORE UPDATE ON public.billing_payment_attempts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
