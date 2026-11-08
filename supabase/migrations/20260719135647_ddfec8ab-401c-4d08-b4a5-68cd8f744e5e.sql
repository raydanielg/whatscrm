ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_organization_id uuid
    REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_organization_id
  ON public.profiles(last_active_organization_id);