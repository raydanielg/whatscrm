ALTER TABLE public.conversations ADD CONSTRAINT conversations_assigned_to_profiles_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';