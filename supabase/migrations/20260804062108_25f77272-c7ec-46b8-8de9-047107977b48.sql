UPDATE public.conversations c
SET deleted_at = NULL
WHERE c.channel = 'webchat'
  AND c.deleted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.conversation_id = c.id AND m.created_at > c.deleted_at
  );