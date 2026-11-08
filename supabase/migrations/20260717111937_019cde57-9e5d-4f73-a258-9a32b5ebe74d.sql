
-- Extend notes
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Relax entity_type check to include company
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_entity_type_check;
ALTER TABLE public.notes ADD CONSTRAINT notes_entity_type_check
  CHECK (entity_type = ANY (ARRAY['contact','company','lead','deal','task']));

CREATE INDEX IF NOT EXISTS notes_body_trgm_idx ON public.notes USING gin (body gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS notes_pinned_idx ON public.notes (entity_type, entity_id, pinned_at DESC) WHERE is_pinned = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS notes_mentions_idx ON public.notes USING gin (mentions);

CREATE INDEX IF NOT EXISTS idx_activities_target ON public.activities (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_object ON public.activities (object_type, object_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_workspace_created ON public.activities (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_verb ON public.activities (verb);

-- Generic activity logger for CRM entities
CREATE OR REPLACE FUNCTION public.tg_activity_log_entity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _entity text := TG_ARGV[0];
  _ws uuid; _org uuid; _actor uuid := auth.uid();
  _target_type text; _target_id text;
  _summary text; _verb text; _data jsonb := '{}'::jsonb;
BEGIN
  _ws := (to_jsonb(COALESCE(NEW, OLD))->>'workspace_id')::uuid;
  _org := (to_jsonb(COALESCE(NEW, OLD))->>'organization_id')::uuid;
  _target_type := _entity;
  _target_id := (to_jsonb(COALESCE(NEW, OLD))->>'id');

  IF TG_OP = 'INSERT' THEN
    _verb := _entity || '.created';
    _summary := 'Created ' || _entity;
    _data := jsonb_build_object('after', to_jsonb(NEW));
    INSERT INTO public.activities(organization_id, workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (_org, _ws, _actor, _verb, _entity, _target_id, _target_type, _target_id, _summary, _data);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- status change
    IF (to_jsonb(OLD)->>'status') IS DISTINCT FROM (to_jsonb(NEW)->>'status') THEN
      INSERT INTO public.activities(organization_id, workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (_org, _ws, _actor, _entity || '.status_changed', _entity, _target_id, _target_type, _target_id,
        'Status: ' || COALESCE((to_jsonb(OLD)->>'status'),'∅') || ' → ' || COALESCE((to_jsonb(NEW)->>'status'),'∅'),
        jsonb_build_object('from', to_jsonb(OLD)->>'status', 'to', to_jsonb(NEW)->>'status'));
    END IF;
    -- assignment change (owner_id or assigned_to)
    IF (to_jsonb(OLD)->>'owner_id') IS DISTINCT FROM (to_jsonb(NEW)->>'owner_id') THEN
      INSERT INTO public.activities(organization_id, workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (_org, _ws, _actor, _entity || '.assigned', _entity, _target_id, _target_type, _target_id,
        'Owner changed', jsonb_build_object('from', to_jsonb(OLD)->>'owner_id', 'to', to_jsonb(NEW)->>'owner_id'));
    END IF;
    IF (to_jsonb(NEW) ? 'assigned_to') AND (to_jsonb(OLD)->>'assigned_to') IS DISTINCT FROM (to_jsonb(NEW)->>'assigned_to') THEN
      INSERT INTO public.activities(organization_id, workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (_org, _ws, _actor, _entity || '.assigned', _entity, _target_id, _target_type, _target_id,
        'Assignee changed', jsonb_build_object('from', to_jsonb(OLD)->>'assigned_to', 'to', to_jsonb(NEW)->>'assigned_to'));
    END IF;
    -- stage change for deals
    IF (to_jsonb(NEW) ? 'stage_id') AND (to_jsonb(OLD)->>'stage_id') IS DISTINCT FROM (to_jsonb(NEW)->>'stage_id') THEN
      INSERT INTO public.activities(organization_id, workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (_org, _ws, _actor, _entity || '.stage_changed', _entity, _target_id, _target_type, _target_id,
        'Stage changed', jsonb_build_object('from', to_jsonb(OLD)->>'stage_id', 'to', to_jsonb(NEW)->>'stage_id'));
    END IF;
    -- tag change
    IF (to_jsonb(NEW) ? 'tags') AND (to_jsonb(OLD)->>'tags') IS DISTINCT FROM (to_jsonb(NEW)->>'tags') THEN
      INSERT INTO public.activities(organization_id, workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (_org, _ws, _actor, _entity || '.tags_changed', _entity, _target_id, _target_type, _target_id,
        'Tags updated', jsonb_build_object('from', to_jsonb(OLD)->'tags', 'to', to_jsonb(NEW)->'tags'));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

-- Attach triggers
DROP TRIGGER IF EXISTS tg_activity_contacts ON public.contacts;
CREATE TRIGGER tg_activity_contacts AFTER INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log_entity('contact');

DROP TRIGGER IF EXISTS tg_activity_leads ON public.leads;
CREATE TRIGGER tg_activity_leads AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log_entity('lead');

DROP TRIGGER IF EXISTS tg_activity_deals ON public.deals;
CREATE TRIGGER tg_activity_deals AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log_entity('deal');

DROP TRIGGER IF EXISTS tg_activity_tasks ON public.tasks;
CREATE TRIGGER tg_activity_tasks AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log_entity('task');

DROP TRIGGER IF EXISTS tg_activity_companies ON public.companies;
CREATE TRIGGER tg_activity_companies AFTER INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log_entity('company');

-- Notes: log create/edit/pin/delete + attribute updated_by, pinned_at
CREATE OR REPLACE FUNCTION public.tg_notes_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _org uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activities(workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
    VALUES (NEW.workspace_id, _actor, 'note.created', 'note', NEW.id::text, NEW.entity_type, NEW.entity_id::text,
      left(NEW.body, 140), jsonb_build_object('mentions', NEW.mentions, 'pinned', NEW.is_pinned));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_pinned IS DISTINCT FROM NEW.is_pinned THEN
      NEW.pinned_at := CASE WHEN NEW.is_pinned THEN now() ELSE NULL END;
      INSERT INTO public.activities(workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (NEW.workspace_id, _actor, CASE WHEN NEW.is_pinned THEN 'note.pinned' ELSE 'note.unpinned' END,
        'note', NEW.id::text, NEW.entity_type, NEW.entity_id::text, left(NEW.body, 140), '{}'::jsonb);
    END IF;
    IF OLD.body IS DISTINCT FROM NEW.body THEN
      NEW.updated_by := _actor;
      INSERT INTO public.activities(workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (NEW.workspace_id, _actor, 'note.updated', 'note', NEW.id::text, NEW.entity_type, NEW.entity_id::text, left(NEW.body,140), '{}'::jsonb);
    END IF;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      INSERT INTO public.activities(workspace_id, actor_id, verb, object_type, object_id, target_type, target_id, summary, data)
      VALUES (NEW.workspace_id, _actor, 'note.deleted', 'note', NEW.id::text, NEW.entity_type, NEW.entity_id::text, left(NEW.body,140), '{}'::jsonb);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_notes_activity ON public.notes;
CREATE TRIGGER tg_notes_activity BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_notes_activity();

-- Mention notifications
CREATE OR REPLACE FUNCTION public.tg_notes_mentions_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m uuid;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions,1) IS NULL THEN RETURN NEW; END IF;
  FOREACH m IN ARRAY NEW.mentions LOOP
    IF m <> COALESCE(NEW.author_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(user_id, workspace_id, kind, title, body, data)
      VALUES (m, NEW.workspace_id, 'mention', 'You were mentioned in a note',
        left(NEW.body, 200),
        jsonb_build_object('note_id', NEW.id, 'entity_type', NEW.entity_type, 'entity_id', NEW.entity_id, 'author_id', NEW.author_id));
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_notes_mentions_notify ON public.notes;
CREATE TRIGGER tg_notes_mentions_notify AFTER INSERT ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_notes_mentions_notify();
