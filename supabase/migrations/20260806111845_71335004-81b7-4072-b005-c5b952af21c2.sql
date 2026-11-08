WITH merged AS (
  SELECT jsonb_object_agg(k, v) AS value
  FROM (
    SELECT DISTINCT ON (k) k, v
    FROM public.settings s, jsonb_each(s.value) AS e(k, v)
    WHERE s.scope = 'platform' AND s.key = 'general'
    ORDER BY k, s.updated_at DESC
  ) x
), keep AS (
  SELECT id FROM public.settings
  WHERE scope = 'platform' AND key = 'general'
  ORDER BY created_at ASC LIMIT 1
)
UPDATE public.settings t
SET value = (SELECT value FROM merged), updated_at = now()
WHERE t.id = (SELECT id FROM keep);

DELETE FROM public.settings
WHERE scope = 'platform' AND key = 'general'
  AND id <> (SELECT id FROM public.settings WHERE scope='platform' AND key='general' ORDER BY created_at ASC LIMIT 1);