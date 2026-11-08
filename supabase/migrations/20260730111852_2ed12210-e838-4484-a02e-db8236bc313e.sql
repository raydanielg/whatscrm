DROP POLICY IF EXISTS "View versions if can view template" ON public.chatbot_template_versions;

CREATE POLICY "View versions for owned workspace or community templates"
ON public.chatbot_template_versions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chatbot_templates t
    WHERE t.id = chatbot_template_versions.template_id
      AND (
        t.is_community = true
        OR t.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.workspace_members wm
          WHERE wm.workspace_id = t.workspace_id
            AND wm.user_id = auth.uid()
        )
      )
  )
);