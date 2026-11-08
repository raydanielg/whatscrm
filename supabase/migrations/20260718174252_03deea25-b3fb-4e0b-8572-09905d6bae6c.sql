
-- Extend source_type enum with csv/txt/faq
ALTER TYPE public.kb_source_type ADD VALUE IF NOT EXISTS 'csv';
ALTER TYPE public.kb_source_type ADD VALUE IF NOT EXISTS 'txt';
ALTER TYPE public.kb_source_type ADD VALUE IF NOT EXISTS 'faq';

-- Collections: cross-cutting groupings of articles (e.g. "Onboarding pack", "Product catalog v2")
CREATE TABLE IF NOT EXISTS public.kb_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS public.kb_collection_articles (
  collection_id UUID NOT NULL REFERENCES public.kb_collections(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, article_id)
);
CREATE INDEX IF NOT EXISTS kb_collection_articles_article_idx ON public.kb_collection_articles(article_id);
CREATE INDEX IF NOT EXISTS kb_collection_articles_workspace_idx ON public.kb_collection_articles(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_collections TO authenticated;
GRANT ALL ON public.kb_collections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_collection_articles TO authenticated;
GRANT ALL ON public.kb_collection_articles TO service_role;

ALTER TABLE public.kb_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_collection_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_collections members read" ON public.kb_collections
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = kb_collections.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "kb_collections editors manage" ON public.kb_collections
  FOR ALL USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = kb_collections.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','agent')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = kb_collections.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','agent')));

CREATE POLICY "kb_collection_articles members read" ON public.kb_collection_articles
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = kb_collection_articles.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "kb_collection_articles editors manage" ON public.kb_collection_articles
  FOR ALL USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = kb_collection_articles.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','agent')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = kb_collection_articles.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','agent')));

CREATE TRIGGER trg_kb_collections_updated_at
  BEFORE UPDATE ON public.kb_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
