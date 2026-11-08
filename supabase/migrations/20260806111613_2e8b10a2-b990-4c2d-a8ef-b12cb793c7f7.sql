INSERT INTO public.settings (scope, key, value, organization_id, workspace_id, user_id)
VALUES ('platform', 'general', jsonb_build_object(
  'platform_name', 'Swiffer',
  'whatsapp_cta_enabled', true,
  'whatsapp_token', '+971501234567',
  'whatsapp_message', 'Hi! I''d like to know more about {site}.',
  'whatsapp_cta_label', 'Chat on WhatsApp',
  'whatsapp_fallback_url', '/contact'
), NULL, NULL, NULL)
ON CONFLICT (scope, organization_id, workspace_id, user_id, key)
DO UPDATE SET value = public.settings.value || EXCLUDED.value, updated_at = now();