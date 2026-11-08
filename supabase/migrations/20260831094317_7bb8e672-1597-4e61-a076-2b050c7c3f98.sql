CREATE TABLE IF NOT EXISTS public.social_post_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  caption text NOT NULL DEFAULT '',
  media_urls text[] NOT NULL DEFAULT '{}',
  link_url text,
  first_comment text,
  content_type public.social_content_type NOT NULL DEFAULT 'post',
  media_kind public.social_media_kind NOT NULL DEFAULT 'none',
  poll_options text[] NOT NULL DEFAULT '{}',
  poll_duration integer NOT NULL DEFAULT 24,
  allow_multi_vote boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_library TO authenticated;
GRANT ALL ON public.social_post_library TO service_role;

ALTER TABLE public.social_post_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read post library" ON public.social_post_library
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ws members write post library" ON public.social_post_library
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS social_post_library_ws_idx ON public.social_post_library (workspace_id, updated_at DESC);

CREATE TRIGGER update_social_post_library_updated_at
  BEFORE UPDATE ON public.social_post_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();