CREATE TABLE IF NOT EXISTS public.contact_list_count_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  lists_scanned integer NOT NULL DEFAULT 0,
  mismatches_found integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contact_list_count_reconciliation_log TO authenticated;
GRANT ALL ON public.contact_list_count_reconciliation_log TO service_role;

ALTER TABLE public.contact_list_count_reconciliation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read reconciliation log" ON public.contact_list_count_reconciliation_log;
CREATE POLICY "Staff can read reconciliation log"
ON public.contact_list_count_reconciliation_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));

CREATE INDEX IF NOT EXISTS idx_cl_count_recon_log_ran_at
  ON public.contact_list_count_reconciliation_log (ran_at DESC);

CREATE OR REPLACE FUNCTION public.reconcile_contact_list_member_counts()
RETURNS TABLE(lists_scanned integer, mismatches_found integer, details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scanned integer := 0;
  _fixed integer := 0;
  _details jsonb := '[]'::jsonb;
  _rec record;
BEGIN
  SELECT count(*) INTO _scanned FROM public.contact_lists;

  FOR _rec IN
    SELECT cl.id,
           cl.workspace_id,
           cl.member_count AS stored_count,
           public.contact_list_active_member_count(cl.id) AS actual_count
    FROM public.contact_lists cl
    ORDER BY cl.id
    FOR UPDATE
  LOOP
    IF coalesce(_rec.stored_count, -1) IS DISTINCT FROM _rec.actual_count THEN
      UPDATE public.contact_lists
      SET member_count = _rec.actual_count
      WHERE id = _rec.id;

      _fixed := _fixed + 1;
      _details := _details || jsonb_build_object(
        'list_id', _rec.id,
        'workspace_id', _rec.workspace_id,
        'stored_count', _rec.stored_count,
        'actual_count', _rec.actual_count
      );
    END IF;
  END LOOP;

  INSERT INTO public.contact_list_count_reconciliation_log (lists_scanned, mismatches_found, details)
  VALUES (_scanned, _fixed, _details);

  DELETE FROM public.contact_list_count_reconciliation_log
  WHERE ran_at < now() - interval '90 days';

  RETURN QUERY SELECT _scanned, _fixed, _details;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_contact_list_member_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_contact_list_member_counts() TO service_role;