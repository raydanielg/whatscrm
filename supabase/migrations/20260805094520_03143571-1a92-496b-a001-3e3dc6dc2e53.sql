-- 1. Restrict chatbot webhook secrets to workspace owners/admins
DROP POLICY IF EXISTS "chatbot_webhooks_select" ON public.chatbot_webhooks;
CREATE POLICY "chatbot_webhooks_select" ON public.chatbot_webhooks
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.workspace_id = chatbot_webhooks.workspace_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'::member_status
    AND m.role = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role])
));

-- 2. Scope avatar reads to the owner and their workspace co-members
DROP POLICY IF EXISTS "Avatars are readable by authenticated" ON storage.objects;
CREATE POLICY "Avatars are readable by owner or co-members" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members me
      JOIN public.workspace_members them ON them.workspace_id = me.workspace_id
      WHERE me.user_id = auth.uid()
        AND me.status = 'active'::member_status
        AND them.status = 'active'::member_status
        AND them.user_id::text = (storage.foldername(name))[1]
    )
  )
);