ALTER TABLE public.vcards
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_reason text,
  ADD COLUMN IF NOT EXISTS revoked_by uuid;

CREATE TABLE IF NOT EXISTS public.vcard_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vcard_id uuid NOT NULL REFERENCES public.vcards(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  version integer NOT NULL,
  action text NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}',
  snapshot jsonb NOT NULL,
  note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vcard_revisions_card ON public.vcard_revisions (vcard_id, version DESC);

GRANT SELECT ON public.vcard_revisions TO authenticated;
GRANT ALL ON public.vcard_revisions TO service_role;

ALTER TABLE public.vcard_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws members read vcard revisions" ON public.vcard_revisions;
CREATE POLICY "ws members read vcard revisions"
  ON public.vcard_revisions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "public vcards readable" ON public.vcards;
CREATE POLICY "public vcards readable"
  ON public.vcards FOR SELECT TO anon, authenticated
  USING (is_public = true AND revoked_at IS NULL);

CREATE OR REPLACE FUNCTION public.vcards_bump_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF to_jsonb(NEW) - 'view_count' - 'updated_at' - 'version'
     IS DISTINCT FROM to_jsonb(OLD) - 'view_count' - 'updated_at' - 'version' THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.vcards_record_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_fields text[] := '{}';
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSE
    IF NEW.version = OLD.version THEN
      RETURN NEW;
    END IF;
    IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
      v_action := 'revoked';
    ELSIF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
      v_action := 'restored';
    ELSE
      v_action := 'updated';
    END IF;
    FOR v_key IN SELECT key FROM jsonb_each(to_jsonb(NEW)) LOOP
      IF v_key NOT IN ('view_count', 'updated_at', 'version')
         AND to_jsonb(NEW) -> v_key IS DISTINCT FROM to_jsonb(OLD) -> v_key THEN
        v_fields := array_append(v_fields, v_key);
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.vcard_revisions (vcard_id, workspace_id, version, action, changed_fields, snapshot, note, changed_by)
  VALUES (NEW.id, NEW.workspace_id, NEW.version, v_action, v_fields, to_jsonb(NEW), NEW.revoked_reason, auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vcards_bump_version ON public.vcards;
CREATE TRIGGER trg_vcards_bump_version
  BEFORE UPDATE ON public.vcards
  FOR EACH ROW EXECUTE FUNCTION public.vcards_bump_version();

DROP TRIGGER IF EXISTS trg_vcards_record_revision ON public.vcards;
CREATE TRIGGER trg_vcards_record_revision
  AFTER INSERT OR UPDATE ON public.vcards
  FOR EACH ROW EXECUTE FUNCTION public.vcards_record_revision();