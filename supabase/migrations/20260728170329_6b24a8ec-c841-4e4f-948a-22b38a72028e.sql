ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_workspace_id_phone_key;
DROP INDEX IF EXISTS public.contacts_workspace_id_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_workspace_phone_active_key
  ON public.contacts (workspace_id, phone)
  WHERE deleted_at IS NULL AND phone IS NOT NULL;