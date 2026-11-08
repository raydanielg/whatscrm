
CREATE EXTENSION IF NOT EXISTS vector;

-- ============= Enums =============
DO $$ BEGIN
  CREATE TYPE public.kb_article_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kb_source_type AS ENUM ('manual','markdown','pdf','docx','url','import');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kb_event_type AS ENUM ('view','helpful','unhelpful','suggested','answer_generated','search_hit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============= Categories =============
CREATE TABLE IF NOT EXISTS public.kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  parent_id uuid REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_kb_cat_ws ON public.kb_categories (workspace_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_categories TO authenticated;
GRANT ALL ON public.kb_categories TO service_role;
ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_cat members read" ON public.kb_categories
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_categories.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "kb_cat editors manage" ON public.kb_categories
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_categories.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin','agent'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_categories.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin','agent'))
  );

-- ============= Articles =============
CREATE TABLE IF NOT EXISTS public.kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  category_id uuid REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  slug text NOT NULL,
  title text NOT NULL,
  summary text,
  content_md text NOT NULL DEFAULT '',
  status public.kb_article_status NOT NULL DEFAULT 'draft',
  tags text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  is_faq boolean NOT NULL DEFAULT false,
  faq_question text,
  is_training boolean NOT NULL DEFAULT false,
  language text DEFAULT 'en',
  source_type public.kb_source_type NOT NULL DEFAULT 'manual',
  source_filename text,
  source_path text,
  version integer NOT NULL DEFAULT 1,
  view_count integer NOT NULL DEFAULT 0,
  helpful_count integer NOT NULL DEFAULT 0,
  unhelpful_count integer NOT NULL DEFAULT 0,
  ai_use_count integer NOT NULL DEFAULT 0,
  last_indexed_at timestamptz,
  needs_reindex boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_tsv tsvector,
  UNIQUE (workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_kb_art_ws ON public.kb_articles (workspace_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_art_cat ON public.kb_articles (workspace_id, category_id);
CREATE INDEX IF NOT EXISTS idx_kb_art_tsv ON public.kb_articles USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_kb_art_tags ON public.kb_articles USING GIN (tags);

CREATE OR REPLACE FUNCTION public.kb_articles_tsv_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.summary,'')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(NEW.tags,'{}'::text[]),' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.content_md,'')), 'C');
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kb_articles_tsv ON public.kb_articles;
CREATE TRIGGER trg_kb_articles_tsv
  BEFORE INSERT OR UPDATE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.kb_articles_tsv_update();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_articles TO authenticated;
GRANT ALL ON public.kb_articles TO service_role;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_art members read" ON public.kb_articles
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_articles.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "kb_art editors manage" ON public.kb_articles
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_articles.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin','agent'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_articles.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin','agent'))
  );

-- ============= Article versions =============
CREATE TABLE IF NOT EXISTS public.kb_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  version integer NOT NULL,
  title text NOT NULL,
  summary text,
  content_md text NOT NULL,
  editor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);
CREATE INDEX IF NOT EXISTS idx_kb_ver_art ON public.kb_article_versions (article_id, version DESC);

GRANT SELECT, INSERT, DELETE ON public.kb_article_versions TO authenticated;
GRANT ALL ON public.kb_article_versions TO service_role;
ALTER TABLE public.kb_article_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_ver members read" ON public.kb_article_versions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_article_versions.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "kb_ver editors write" ON public.kb_article_versions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_article_versions.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin','agent'))
  );
CREATE POLICY "kb_ver admins delete" ON public.kb_article_versions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_article_versions.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin'))
  );

-- ============= Chunks (embeddings) =============
-- Use 1536-dim vector (OpenAI text-embedding-3-small default) so we can use
-- pgvector HNSW cosine index directly (HNSW caps at 2000 dims).
CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  tokens integer,
  embedding vector(1536),
  embedding_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_ws ON public.kb_chunks (workspace_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_art ON public.kb_chunks (article_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_vec ON public.kb_chunks USING hnsw (embedding vector_cosine_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_chunks TO authenticated;
GRANT ALL ON public.kb_chunks TO service_role;
ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_chunks members read" ON public.kb_chunks
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_chunks.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "kb_chunks editors write" ON public.kb_chunks
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_chunks.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin','agent'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_chunks.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin','agent'))
  );

-- ============= Analytics =============
CREATE TABLE IF NOT EXISTS public.kb_article_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  event_type public.kb_event_type NOT NULL,
  user_id uuid,
  conversation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_evt_art ON public.kb_article_events (article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_evt_ws ON public.kb_article_events (workspace_id, event_type, created_at DESC);

GRANT SELECT, INSERT ON public.kb_article_events TO authenticated;
GRANT ALL ON public.kb_article_events TO service_role;
ALTER TABLE public.kb_article_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_evt members read" ON public.kb_article_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_article_events.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "kb_evt members insert" ON public.kb_article_events
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = kb_article_events.workspace_id AND m.user_id = auth.uid())
  );

-- ============= Semantic search RPC =============
CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  p_workspace_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer DEFAULT 6,
  p_min_similarity float DEFAULT 0.0,
  p_only_published boolean DEFAULT true
)
RETURNS TABLE (
  chunk_id uuid,
  article_id uuid,
  chunk_index integer,
  content text,
  similarity float,
  title text,
  slug text,
  summary text,
  category_id uuid,
  is_faq boolean
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    c.id AS chunk_id,
    c.article_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> p_query_embedding) AS similarity,
    a.title,
    a.slug,
    a.summary,
    a.category_id,
    a.is_faq
  FROM public.kb_chunks c
  JOIN public.kb_articles a ON a.id = c.article_id
  WHERE c.workspace_id = p_workspace_id
    AND c.embedding IS NOT NULL
    AND (NOT p_only_published OR a.status = 'published')
    AND 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT greatest(p_match_count, 1);
$$;

-- ============= Storage policies for kb-sources =============
DROP POLICY IF EXISTS "kb-sources members read" ON storage.objects;
DROP POLICY IF EXISTS "kb-sources editors write" ON storage.objects;
DROP POLICY IF EXISTS "kb-sources editors update" ON storage.objects;
DROP POLICY IF EXISTS "kb-sources editors delete" ON storage.objects;

CREATE POLICY "kb-sources members read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'kb-sources'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = auth.uid()
        AND m.workspace_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "kb-sources editors write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'kb-sources'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = auth.uid()
        AND m.workspace_id::text = (storage.foldername(name))[1]
        AND m.role IN ('owner','admin','agent')
    )
  );

CREATE POLICY "kb-sources editors update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'kb-sources'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = auth.uid()
        AND m.workspace_id::text = (storage.foldername(name))[1]
        AND m.role IN ('owner','admin','agent')
    )
  );

CREATE POLICY "kb-sources editors delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'kb-sources'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = auth.uid()
        AND m.workspace_id::text = (storage.foldername(name))[1]
        AND m.role IN ('owner','admin','agent')
    )
  );
