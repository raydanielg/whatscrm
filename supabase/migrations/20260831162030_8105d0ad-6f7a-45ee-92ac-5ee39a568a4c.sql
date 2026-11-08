CREATE TABLE public.social_post_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.social_post_targets(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.social_channels(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_id)
);
GRANT SELECT ON public.social_post_metrics TO authenticated;
GRANT ALL ON public.social_post_metrics TO service_role;
ALTER TABLE public.social_post_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace post metrics" ON public.social_post_metrics
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER update_social_post_metrics_updated_at BEFORE UPDATE ON public.social_post_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();