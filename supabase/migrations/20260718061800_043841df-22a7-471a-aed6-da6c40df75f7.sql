
-- Extend notification kinds
ALTER TYPE billing_notification_kind ADD VALUE IF NOT EXISTS 'payment.succeeded';
ALTER TYPE billing_notification_kind ADD VALUE IF NOT EXISTS 'invoice.due';
ALTER TYPE billing_notification_kind ADD VALUE IF NOT EXISTS 'subscription.expired';
ALTER TYPE billing_notification_kind ADD VALUE IF NOT EXISTS 'usage.limit_reached';
ALTER TYPE billing_notification_kind ADD VALUE IF NOT EXISTS 'upgrade.recommended';

-- Subscription lifecycle columns
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscriptions_grace
  ON public.subscriptions(grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;

-- Admin-configurable automation settings
CREATE TABLE IF NOT EXISTS public.billing_automation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Notification toggles
  notify_trial_ending boolean NOT NULL DEFAULT true,
  notify_payment_failed boolean NOT NULL DEFAULT true,
  notify_payment_succeeded boolean NOT NULL DEFAULT true,
  notify_invoice_generated boolean NOT NULL DEFAULT true,
  notify_invoice_due boolean NOT NULL DEFAULT true,
  notify_subscription_renewed boolean NOT NULL DEFAULT true,
  notify_subscription_expired boolean NOT NULL DEFAULT true,
  notify_usage_limit_reached boolean NOT NULL DEFAULT true,
  notify_quota_warning boolean NOT NULL DEFAULT true,
  notify_upgrade_recommendation boolean NOT NULL DEFAULT true,

  -- Timing knobs
  trial_ending_warning_days integer NOT NULL DEFAULT 3,
  invoice_due_reminder_days integer NOT NULL DEFAULT 3,
  quota_warning_threshold_pct integer NOT NULL DEFAULT 80,

  -- Payment retry schedule (hours between attempts)
  payment_retry_hours integer[] NOT NULL DEFAULT ARRAY[1, 24, 72],
  max_payment_retries integer NOT NULL DEFAULT 3,

  -- Grace / suspension automation
  grace_period_days integer NOT NULL DEFAULT 7,
  auto_suspend_after_grace boolean NOT NULL DEFAULT true,
  auto_reactivate_on_payment boolean NOT NULL DEFAULT true,

  -- Delivery channels
  channels text[] NOT NULL DEFAULT ARRAY['email', 'in_app'],

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_automation_config TO authenticated;
GRANT ALL ON public.billing_automation_config TO service_role;

ALTER TABLE public.billing_automation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admins_read_automation_config"
  ON public.billing_automation_config
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = billing_automation_config.organization_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "org_admins_write_automation_config"
  ON public.billing_automation_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = billing_automation_config.organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = billing_automation_config.organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION public.tg_billing_automation_config_updated()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS billing_automation_config_updated ON public.billing_automation_config;
CREATE TRIGGER billing_automation_config_updated
  BEFORE UPDATE ON public.billing_automation_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_billing_automation_config_updated();
