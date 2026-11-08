INSERT INTO public.message_attachments (workspace_id, message_id, storage_bucket, storage_path, url, file_name, mime_type, size_bytes, duration_seconds, uploaded_by, created_at, uploaded_at)
SELECT m.workspace_id,
       m.id,
       'attachments',
       NULLIF(m.metadata->>'media_path',''),
       CASE WHEN NULLIF(m.metadata->>'media_path','') IS NULL THEN m.media_url ELSE NULL END,
       NULLIF(m.metadata->>'media_name',''),
       m.media_type,
       m.media_size,
       m.media_duration_seconds,
       m.sent_by,
       m.created_at,
       m.created_at
FROM public.messages m
WHERE m.deleted_at IS NULL
  AND COALESCE(m.is_demo, false) = false
  AND (NULLIF(m.metadata->>'media_path','') IS NOT NULL OR m.media_url IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.message_attachments a WHERE a.message_id = m.id);