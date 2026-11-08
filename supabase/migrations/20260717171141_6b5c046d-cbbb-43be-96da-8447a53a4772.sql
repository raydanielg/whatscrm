ALTER TABLE public.bi_reports ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','workspace','public'));
ALTER TABLE public.bi_reports ADD COLUMN IF NOT EXISTS calculated_fields jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS bi_reports_visibility_idx ON public.bi_reports(workspace_id, visibility);