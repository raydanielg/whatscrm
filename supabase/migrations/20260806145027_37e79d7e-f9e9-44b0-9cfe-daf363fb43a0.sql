-- Retire superseded legacy plans from the public catalog
UPDATE public.plans SET is_public = false WHERE code IN ('pro', 'pro_yearly');

-- Free
UPDATE public.plans SET
  tagline = COALESCE(tagline, 'For solo makers testing the waters'),
  cta_label = COALESCE(cta_label, 'Start free'),
  sort_order = 10,
  limits = '{"seats":3,"workspaces":1,"agents":1,"contacts":250,"messages_per_month":500}'::jsonb,
  features = '{"support":"community","channels":1,"broadcasts":false,"ai":false,"api":false,"automations":false}'::jsonb
WHERE code = 'free';

-- Starter / Professional ordering
UPDATE public.plans SET sort_order = 20 WHERE code = 'starter';
UPDATE public.plans SET sort_order = 21 WHERE code = 'starter_yearly';
UPDATE public.plans SET sort_order = 30, cta_label = COALESCE(cta_label, 'Start free trial') WHERE code = 'professional';
UPDATE public.plans SET sort_order = 31 WHERE code = 'professional_yearly';

-- Business
UPDATE public.plans SET
  sort_order = 40,
  cta_label = COALESCE(cta_label, 'Start free trial'),
  trial_days = GREATEST(trial_days, 14),
  limits = '{"seats":50,"workspaces":25,"agents":50,"contacts":100000,"messages_per_month":100000}'::jsonb,
  features = '{"support":"priority","sso":true,"channels":10,"broadcasts":true,"ai":true,"api":true,"automations":true}'::jsonb
WHERE code = 'business';

UPDATE public.plans SET
  sort_order = 41,
  monthly_plan_code = 'business',
  cta_label = COALESCE(cta_label, 'Start free trial'),
  trial_days = GREATEST(trial_days, 14),
  limits = '{"seats":50,"workspaces":25,"agents":50,"contacts":100000,"messages_per_month":100000}'::jsonb,
  features = '{"support":"priority","sso":true,"channels":10,"broadcasts":true,"ai":true,"api":true,"automations":true}'::jsonb
WHERE code = 'business_yearly';

-- Enterprise
UPDATE public.plans SET
  sort_order = 50,
  cta_label = COALESCE(cta_label, 'Contact sales'),
  tagline = COALESCE(tagline, 'Custom limits, SSO and dedicated support'),
  limits = '{"seats":-1,"workspaces":-1,"agents":-1,"contacts":-1,"messages_per_month":-1}'::jsonb,
  features = '{"support":"dedicated","sso":true,"sla":true,"audit_export":true,"channels":"unlimited","broadcasts":true,"ai":true,"api":true,"automations":true}'::jsonb
WHERE code = 'enterprise';