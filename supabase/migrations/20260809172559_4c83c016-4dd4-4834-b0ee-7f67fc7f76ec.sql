-- Drop the insecure policy that allowed any anonymous insert
DROP POLICY IF EXISTS "vcard views insert" ON public.vcard_views;

-- Create a hardened policy that only allows inserts for public vcards or vcards owned by the user
CREATE POLICY "vcard views insert" ON public.vcard_views 
FOR INSERT 
TO anon, authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vcards 
    WHERE id = vcard_id 
    AND (is_public = true OR (auth.uid() IS NOT NULL AND created_by = auth.uid()))
  )
);
