-- Backfill base URL for built-in Lovable AI providers
UPDATE public.ai_providers
SET base_url = 'https://ai.gateway.lovable.dev/v1'
WHERE kind = 'lovable' AND (base_url IS NULL OR base_url = '');

-- Seed the Lovable AI model catalog for every Lovable provider that has none
INSERT INTO public.ai_models (provider_id, model_id, display_name, capabilities, enabled, is_default)
SELECT p.id, m.model_id, m.display_name, '{"chat": true}'::jsonb, true, m.is_default
FROM public.ai_providers p
CROSS JOIN (VALUES
  ('google/gemini-3.5-flash', 'Gemini 3.5 Flash', true),
  ('google/gemini-3.6-flash', 'Gemini 3.6 Flash', false),
  ('google/gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', false),
  ('google/gemini-2.5-pro', 'Gemini 2.5 Pro', false),
  ('openai/gpt-5.5', 'GPT-5.5', false),
  ('openai/gpt-5.4-mini', 'GPT-5.4 Mini', false)
) AS m(model_id, display_name, is_default)
WHERE p.kind = 'lovable'
  AND NOT EXISTS (SELECT 1 FROM public.ai_models am WHERE am.provider_id = p.id);