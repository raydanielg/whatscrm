INSERT INTO public.settings (scope, key, value, organization_id, workspace_id, user_id)
VALUES ('platform', 'analytics', '{"provider":"custom","track_page_views":true,"require_consent":false,"debug":true}'::jsonb, NULL, NULL, NULL)
ON CONFLICT (scope, organization_id, workspace_id, user_id, key) DO NOTHING;