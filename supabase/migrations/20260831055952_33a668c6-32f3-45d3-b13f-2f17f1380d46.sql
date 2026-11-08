CREATE TYPE public.social_content_type AS ENUM ('post', 'story', 'reel', 'short', 'poll');
CREATE TYPE public.social_media_kind AS ENUM ('none', 'image', 'video', 'carousel');
CREATE TYPE public.social_target_status AS ENUM ('pending', 'queued', 'publishing', 'published', 'failed', 'cancelled');

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS content_type public.social_content_type NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS media_kind public.social_media_kind NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS poll_options text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS poll_duration integer,
  ADD COLUMN IF NOT EXISTS allow_multi_vote boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

ALTER TABLE public.social_post_targets
  ADD COLUMN IF NOT EXISTS provider_response jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;

ALTER TABLE public.social_channels
  ADD COLUMN IF NOT EXISTS token_refresh_error text,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS platform_options jsonb NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_social_posts_updated_at' AND tgrelid = 'public.social_posts'::regclass
  ) THEN
    CREATE TRIGGER trg_social_posts_updated_at
    BEFORE UPDATE ON public.social_posts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_social_post_targets_updated_at' AND tgrelid = 'public.social_post_targets'::regclass
  ) THEN
    CREATE TRIGGER trg_social_post_targets_updated_at
    BEFORE UPDATE ON public.social_post_targets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_social_channels_updated_at' AND tgrelid = 'public.social_channels'::regclass
  ) THEN
    CREATE TRIGGER trg_social_channels_updated_at
    BEFORE UPDATE ON public.social_channels
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;