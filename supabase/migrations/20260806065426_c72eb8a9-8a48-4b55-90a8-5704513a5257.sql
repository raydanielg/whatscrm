INSERT INTO public.settings (scope, key, value, organization_id, workspace_id, user_id)
VALUES
  ('platform', 'general', '{"platform_name":"Swiffer","tagline":"Customer conversations, unified","default_org_size":5}'::jsonb, NULL, NULL, NULL),
  ('platform', 'branding', '{"accent_color":"#d81c20"}'::jsonb, NULL, NULL, NULL)
ON CONFLICT (scope, organization_id, workspace_id, user_id, key) DO NOTHING;