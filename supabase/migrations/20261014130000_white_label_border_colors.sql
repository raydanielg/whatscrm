ALTER TABLE public.white_label_configs
  ADD COLUMN IF NOT EXISTS border_color text,
  ADD COLUMN IF NOT EXISTS foreground_color text,
  ADD COLUMN IF NOT EXISTS sidebar_border text;

NOTIFY pgrst, 'reload schema';
