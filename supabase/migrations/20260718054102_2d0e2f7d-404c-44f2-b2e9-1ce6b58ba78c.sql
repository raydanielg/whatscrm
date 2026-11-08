
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS tier public.plan_tier NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS badge text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS highlight boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_plan_code text;

CREATE INDEX IF NOT EXISTS idx_plans_tier_interval ON public.plans (tier, interval) WHERE is_active;

DROP POLICY IF EXISTS "Super admins manage plans" ON public.plans;
CREATE POLICY "Super admins manage plans" ON public.plans
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','support')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'));

UPDATE public.plans SET tier='free' WHERE code='free';
UPDATE public.plans SET tier='professional', badge='Most Popular', highlight=true, tagline='For growing teams that need power and AI' WHERE code='pro';
UPDATE public.plans SET tier='business', tagline='For companies scaling WhatsApp operations' WHERE code='business';
UPDATE public.plans SET tier='enterprise', tagline='Custom limits, SSO, and dedicated support', cta_label='Contact sales' WHERE code='enterprise';

INSERT INTO public.plans (code, name, tier, description, tagline, price_cents, currency, interval, trial_days, features, limits, sort_order, is_public, badge, highlight)
VALUES
  ('starter', 'Starter', 'starter', 'Great for solo founders getting started.',
   'For solo operators and side projects', 1900, 'USD', 'month', 14,
   '{"channels":1,"agents":2,"broadcasts":true,"ai":false,"api":false,"support":"community"}'::jsonb,
   '{"messages_per_month":2500,"contacts":1000,"agents":2}'::jsonb,
   20, true, null, false),
  ('professional', 'Professional', 'professional', 'For growing teams that need scale, AI and automations.',
   'For growing teams that need scale and AI', 4900, 'USD', 'month', 14,
   '{"channels":3,"agents":10,"broadcasts":true,"ai":true,"automations":true,"api":true,"support":"email"}'::jsonb,
   '{"messages_per_month":25000,"contacts":25000,"agents":10}'::jsonb,
   30, true, 'Most Popular', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plans (code, name, tier, description, tagline, price_cents, currency, interval, trial_days, features, limits, sort_order, is_public, monthly_plan_code)
SELECT p.code || '_yearly', p.name || ' (Yearly)', p.tier, p.description, p.tagline,
       (p.price_cents * 12 * 0.8)::int, p.currency, 'year'::plan_interval, p.trial_days,
       p.features, p.limits, p.sort_order + 1, p.is_public, p.code
FROM public.plans p
WHERE p.code IN ('starter','pro','professional','business')
  AND p.interval='month'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plans (code, name, tier, description, tagline, price_cents, currency, interval, trial_days, features, limits, sort_order, is_public, cta_label)
VALUES
  ('enterprise_lifetime', 'Enterprise Lifetime', 'enterprise',
   'One-time payment, unlimited use. Contact sales for custom terms.',
   'Pay once, own forever', 999900, 'USD', 'lifetime', 0,
   '{"channels":"unlimited","agents":"unlimited","broadcasts":true,"ai":true,"automations":true,"api":true,"sso":true,"sla":true,"support":"dedicated"}'::jsonb,
   '{"messages_per_month":-1,"contacts":-1,"agents":-1}'::jsonb,
   90, false, 'Contact sales')
ON CONFLICT (code) DO NOTHING;
