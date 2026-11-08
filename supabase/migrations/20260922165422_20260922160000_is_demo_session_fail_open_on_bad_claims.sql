CREATE OR REPLACE FUNCTION public.is_demo_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text := current_setting('request.jwt.claims', true);
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN false;
  END IF;
  RETURN COALESCE((raw::jsonb -> 'app_metadata' ->> 'demo') = 'true', false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
