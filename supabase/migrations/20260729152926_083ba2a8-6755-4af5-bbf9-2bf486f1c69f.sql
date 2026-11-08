CREATE OR REPLACE FUNCTION public.sync_contact_list_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _list_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _list_id := OLD.list_id;
  ELSE
    _list_id := NEW.list_id;
  END IF;

  UPDATE public.contact_lists cl
     SET member_count = (
           SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = cl.id
         ),
         last_computed_at = now(),
         updated_at = now()
   WHERE cl.id = _list_id;

  IF TG_OP = 'UPDATE' AND NEW.list_id IS DISTINCT FROM OLD.list_id THEN
    UPDATE public.contact_lists cl
       SET member_count = (
             SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = cl.id
           ),
           last_computed_at = now(),
           updated_at = now()
     WHERE cl.id = OLD.list_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_list_members_count ON public.contact_list_members;
CREATE TRIGGER trg_contact_list_members_count
AFTER INSERT OR UPDATE OR DELETE ON public.contact_list_members
FOR EACH ROW EXECUTE FUNCTION public.sync_contact_list_member_count();

UPDATE public.contact_lists cl
   SET member_count = COALESCE((
         SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = cl.id
       ), 0),
       last_computed_at = now();