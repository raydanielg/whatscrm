-- Storage fix: social-media policies called is_workspace_member() backwards.
--
-- public.is_workspace_member(_workspace_id uuid, _user_id uuid)
--
-- Migration 20260831091922 created the three `social-media` policies as
--   is_workspace_member(auth.uid(), (storage.foldername(name))[1]::uuid)
-- i.e. (user_id, workspace_id). There is only one overload, so the call does
-- not error — it silently looks for a workspace whose id equals the caller's
-- user id, finds none, and returns false. Every Social Studio upload, read and
-- delete has therefore been denied since that migration shipped, for every
-- user. Verified against the live project: for an active member,
--   is_workspace_member(workspace_id, user_id) = true
--   is_workspace_member(user_id, workspace_id) = false
--
-- Every other bucket (attachments, campaign-media, custom-fields, kb-sources,
-- widget-uploads) already passes the arguments in the documented order; this
-- brings social-media in line with them. No bucket is created, dropped or made
-- public here, and no object is touched.

DROP POLICY IF EXISTS "social_media_read"   ON storage.objects;
DROP POLICY IF EXISTS "social_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "social_media_delete" ON storage.objects;

CREATE POLICY "social_media_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'social-media'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "social_media_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'social-media'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "social_media_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'social-media'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- Composer media is replaced by uploading a new UUID-named object, never by
-- overwriting one (`upsert: false`), so social-media intentionally has no
-- UPDATE policy. Leaving it absent keeps the writable surface minimal.


-- Re-assert the required buckets so a fresh install provisions them even if
-- 20260924160000 is ever squashed away. Creation stays idempotent and never
-- rewrites an existing bucket's visibility.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars',        'avatars',        false),
  ('attachments',    'attachments',    false),
  ('branding',       'branding',       false),
  ('campaign-media', 'campaign-media', false),
  ('custom-fields',  'custom-fields',  false),
  ('exports',        'exports',        false),
  ('kb-sources',     'kb-sources',     false),
  ('social-media',   'social-media',   false),
  ('widget-uploads', 'widget-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Mirror the size ceilings the application already enforces client- and
-- server-side onto the buckets themselves, so the limit survives a caller that
-- forgets to check. COALESCE keeps any limit an operator set by hand — this
-- only fills in NULLs, and never loosens or removes an existing limit.
UPDATE storage.buckets AS b
SET file_size_limit = v.limit_bytes
FROM (VALUES
  ('branding',       5   * 1024 * 1024),
  ('widget-uploads', 25  * 1024 * 1024),
  ('social-media',   200 * 1024 * 1024)
) AS v(id, limit_bytes)
WHERE b.id = v.id AND b.file_size_limit IS NULL;

-- allowed_mime_types is deliberately left NULL. The application validates MIME
-- types per feature with richer rules than a flat list (e.g. branding accepts
-- .ico files that browsers report under several MIME strings), and a bucket
-- level list would reject them with an opaque error.
