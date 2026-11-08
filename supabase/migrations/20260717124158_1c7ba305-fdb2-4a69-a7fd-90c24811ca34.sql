
-- Extend message_attachments with enterprise media metadata
ALTER TABLE public.message_attachments
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'attachments',
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace','internal','public')),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS virus_scan_status text NOT NULL DEFAULT 'pending' CHECK (virus_scan_status IN ('pending','clean','infected','skipped')),
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_msg_att_workspace ON public.message_attachments(workspace_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_att_expires ON public.message_attachments(expires_at) WHERE expires_at IS NOT NULL AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_msg_att_sha ON public.message_attachments(workspace_id, sha256) WHERE sha256 IS NOT NULL;

-- Media access analytics log
CREATE TABLE IF NOT EXISTS public.media_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES public.message_attachments(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('view','download','upload','delete')),
  bytes bigint,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.media_access_log TO authenticated;
GRANT ALL ON public.media_access_log TO service_role;

ALTER TABLE public.media_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_access_log: members read"
  ON public.media_access_log FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "media_access_log: members insert own"
  ON public.media_access_log FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND (actor_id IS NULL OR actor_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_media_log_ws_time ON public.media_access_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_log_att ON public.media_access_log(attachment_id);

-- Aggregate stats for a workspace
CREATE OR REPLACE FUNCTION public.workspace_media_stats(_workspace_id uuid)
RETURNS TABLE (
  total_files bigint,
  total_bytes bigint,
  image_bytes bigint,
  video_bytes bigint,
  audio_bytes bigint,
  document_bytes bigint,
  expiring_soon bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    count(*)::bigint AS total_files,
    coalesce(sum(size_bytes),0)::bigint AS total_bytes,
    coalesce(sum(size_bytes) FILTER (WHERE mime_type LIKE 'image/%'),0)::bigint AS image_bytes,
    coalesce(sum(size_bytes) FILTER (WHERE mime_type LIKE 'video/%'),0)::bigint AS video_bytes,
    coalesce(sum(size_bytes) FILTER (WHERE mime_type LIKE 'audio/%'),0)::bigint AS audio_bytes,
    coalesce(sum(size_bytes) FILTER (WHERE mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%' AND mime_type NOT LIKE 'audio/%'),0)::bigint AS document_bytes,
    count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < (now() + interval '7 days') AND is_deleted = false)::bigint AS expiring_soon
  FROM public.message_attachments
  WHERE workspace_id = _workspace_id AND is_deleted = false
    AND public.is_workspace_member(_workspace_id, auth.uid());
$$;

-- Mark a download / view and bump analytics
CREATE OR REPLACE FUNCTION public.mark_media_accessed(_attachment_id uuid, _action text DEFAULT 'view')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _ws uuid; _size bigint;
BEGIN
  SELECT workspace_id, size_bytes INTO _ws, _size
    FROM public.message_attachments WHERE id = _attachment_id;
  IF _ws IS NULL THEN RAISE EXCEPTION 'Attachment not found'; END IF;
  IF NOT public.is_workspace_member(_ws, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.message_attachments
    SET download_count = CASE WHEN _action = 'download' THEN download_count + 1 ELSE download_count END,
        last_accessed_at = now()
    WHERE id = _attachment_id;
  INSERT INTO public.media_access_log(workspace_id, attachment_id, actor_id, action, bytes)
  VALUES (_ws, _attachment_id, auth.uid(), _action, _size);
END $$;

-- Cleanup expired media (called by cron; soft-deletes rows past expires_at
-- and removes their storage objects via a caller that uses the returned paths)
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
    SET is_deleted = true, updated_at_placeholder = m.uploaded_at
    FROM claimed
    WHERE m.id = claimed.id
    RETURNING m.id, m.storage_bucket, m.storage_path;
END $$;
