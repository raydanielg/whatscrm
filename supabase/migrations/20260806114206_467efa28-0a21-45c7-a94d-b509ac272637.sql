UPDATE public.settings
SET value = '{"provider":"none","track_page_views":true,"require_consent":true,"debug":false}'::jsonb,
    updated_at = now()
WHERE scope = 'platform' AND key = 'analytics' AND organization_id IS NULL AND workspace_id IS NULL AND user_id IS NULL;