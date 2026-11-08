DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_policies WHERE schemaname='public' AND tablename='conversations' AND policyname='conversations by workspace member';
  IF FOUND THEN
    EXECUTE 'DROP POLICY "conversations by workspace member" ON public.conversations';
    EXECUTE format('CREATE POLICY "conversations member select" ON public.conversations FOR SELECT TO authenticated USING (%s)', r.qual);
    EXECUTE format('CREATE POLICY "conversations member insert" ON public.conversations FOR INSERT TO authenticated WITH CHECK (%s)', COALESCE(r.with_check, r.qual));
    EXECUTE format('CREATE POLICY "conversations member update" ON public.conversations FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', r.qual, COALESCE(r.with_check, r.qual));
  END IF;
END $$;