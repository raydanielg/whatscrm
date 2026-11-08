DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.whatsapp_auto_replies'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%trigger_type%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.whatsapp_auto_replies DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.whatsapp_auto_replies
  ADD CONSTRAINT whatsapp_auto_replies_trigger_type_check
  CHECK (trigger_type IN ('exact','contains','starts_with','regex','any','welcome','offline','handoff','language'));