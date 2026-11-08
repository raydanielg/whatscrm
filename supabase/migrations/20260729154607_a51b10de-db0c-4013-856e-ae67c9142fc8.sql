-- Helper: authoritative count for one list (active contacts only)
CREATE OR REPLACE FUNCTION public.contact_list_active_member_count(_list_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
    FROM public.contact_list_members m
    JOIN public.contacts c ON c.id = m.contact_id
   WHERE m.list_id = _list_id
     AND c.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.sync_contact_list_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    _ids := ARRAY[OLD.list_id];
  ELSIF TG_OP = 'UPDATE' THEN
    _ids := ARRAY[NEW.list_id, OLD.list_id];
  ELSE
    _ids := ARRAY[NEW.list_id];
  END IF;

  UPDATE public.contact_lists cl
     SET member_count = public.contact_list_active_member_count(cl.id),
         last_computed_at = now(),
         updated_at = now()
   WHERE cl.id = ANY(_ids);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_all_contact_list_member_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contact_lists cl
     SET member_count = public.contact_list_active_member_count(cl.id),
         last_computed_at = now(),
         updated_at = now()
   WHERE cl.member_count IS DISTINCT FROM public.contact_list_active_member_count(cl.id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_contact_list_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.member_count := 0;
  ELSIF NEW.member_count IS DISTINCT FROM OLD.member_count THEN
    NEW.member_count := public.contact_list_active_member_count(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Recount lists when a contact is archived or restored
CREATE OR REPLACE FUNCTION public.sync_lists_on_contact_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NULL;
  END IF;

  UPDATE public.contact_lists cl
     SET member_count = public.contact_list_active_member_count(cl.id),
         last_computed_at = now(),
         updated_at = now()
   WHERE cl.id IN (
     SELECT m.list_id FROM public.contact_list_members m WHERE m.contact_id = NEW.id
   );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_soft_delete_list_counts ON public.contacts;
CREATE TRIGGER trg_contacts_soft_delete_list_counts
AFTER UPDATE OF deleted_at ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.sync_lists_on_contact_soft_delete();

-- Recalculate all lists under the new rule
UPDATE public.contact_lists cl
   SET member_count = public.contact_list_active_member_count(cl.id),
       last_computed_at = now()
 WHERE cl.member_count IS DISTINCT FROM public.contact_list_active_member_count(cl.id);