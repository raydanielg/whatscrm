-- 1. Harden the row-level sync function (concurrency-safe, self-healing)
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
     SET member_count = (
           SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = cl.id
         ),
         last_computed_at = now(),
         updated_at = now()
   WHERE cl.id = ANY(_ids)
     AND cl.id IS NOT NULL;

  RETURN NULL;
END;
$$;

-- 2. Statement-level recount for TRUNCATE (row triggers never fire for it)
CREATE OR REPLACE FUNCTION public.sync_all_contact_list_member_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contact_lists cl
     SET member_count = (
           SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = cl.id
         ),
         last_computed_at = now(),
         updated_at = now()
   WHERE cl.member_count IS DISTINCT FROM (
           SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = cl.id
         );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_list_members_truncate ON public.contact_list_members;
CREATE TRIGGER trg_contact_list_members_truncate
AFTER TRUNCATE ON public.contact_list_members
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_all_contact_list_member_counts();

-- 3. Make member_count non-writable by clients: always derive it on the list row itself
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
    NEW.member_count := (
      SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_lists_member_count_guard ON public.contact_lists;
CREATE TRIGGER trg_contact_lists_member_count_guard
BEFORE INSERT OR UPDATE OF member_count ON public.contact_lists
FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_list_member_count();

-- 4. Backfill / correct any existing drift
UPDATE public.contact_lists cl
   SET member_count = (
         SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = cl.id
       ),
       last_computed_at = now()
 WHERE cl.member_count IS DISTINCT FROM (
         SELECT count(*) FROM public.contact_list_members m WHERE m.list_id = cl.id
       );