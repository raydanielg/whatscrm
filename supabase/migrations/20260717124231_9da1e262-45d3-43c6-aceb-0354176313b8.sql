
CREATE OR REPLACE FUNCTION public.claim_expired_media(_limit int DEFAULT 100)
RETURNS TABLE (id uuid, storage_bucket text, storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT ma.id
    FROM public.message_attachments ma
    WHERE ma.expires_at IS NOT NULL
      AND ma.expires_at < now()
      AND ma.is_deleted = false
    ORDER BY ma.expires_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.message_attachments m
    SET is_deleted = true
    FROM claimed
    WHERE m.id = claimed.id
    RETURNING m.id, m.storage_bucket, m.storage_path;
END $$;
