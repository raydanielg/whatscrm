
-- Extend custom_field_definitions
ALTER TABLE public.custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_entity_type_check;
ALTER TABLE public.custom_field_definitions ADD CONSTRAINT custom_field_definitions_entity_type_check
  CHECK (entity_type = ANY (ARRAY['contact','company','lead','customer','deal','task']));

ALTER TABLE public.custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_field_type_check;
ALTER TABLE public.custom_field_definitions ADD CONSTRAINT custom_field_definitions_field_type_check
  CHECK (field_type = ANY (ARRAY[
    'text','textarea','number','decimal','currency','email','phone','url',
    'date','datetime','boolean','checkbox','switch','select','multi_select',
    'radio','file','image','relationship'
  ]));

ALTER TABLE public.custom_field_definitions
  ADD COLUMN IF NOT EXISTS placeholder text,
  ADD COLUMN IF NOT EXISTS help_text text,
  ADD COLUMN IF NOT EXISTS validation jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS relationship_entity text,
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS section text;

-- Storage policies for custom-fields bucket
CREATE POLICY "custom_fields_read_own_workspace"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'custom-fields'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "custom_fields_upload_own_workspace"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'custom-fields'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "custom_fields_update_own_workspace"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'custom-fields'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "custom_fields_delete_own_workspace"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'custom-fields'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);
