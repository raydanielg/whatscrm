ALTER TABLE public.white_label_configs REPLICA IDENTITY FULL;
ALTER TABLE public.theme_installations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.white_label_configs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.theme_installations;