ALTER TABLE public.social_channels DROP CONSTRAINT IF EXISTS social_channels_platform_check;
ALTER TABLE public.social_channels ADD CONSTRAINT social_channels_platform_check
  CHECK (platform = ANY (ARRAY['facebook','instagram','linkedin','x','tiktok','youtube','threads']));