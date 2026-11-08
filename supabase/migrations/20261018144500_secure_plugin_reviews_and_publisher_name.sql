-- Show the current product publisher name for official marketplace listings.
UPDATE public.plugins
SET publisher_name = 'WRAPCODERS'
WHERE lower(coalesce(publisher_name, '')) IN ('wacrm', 'swiffer');

-- A review must belong to a workspace where the reviewer is a member and
-- which owns a currently active license for the plugin.
CREATE OR REPLACE FUNCTION public.can_review_plugin(
  _plugin_id uuid,
  _workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    JOIN public.plugin_licenses pl
      ON pl.customer_workspace_id = wm.workspace_id
     AND pl.plugin_id = _plugin_id
     AND pl.status = 'active'
     AND (pl.expires_at IS NULL OR pl.expires_at > now())
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.can_review_plugin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_review_plugin(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "plugin_reviews self write" ON public.plugin_reviews;
DROP POLICY IF EXISTS "plugin_reviews self update" ON public.plugin_reviews;

CREATE POLICY "plugin_reviews licensed buyer insert"
ON public.plugin_reviews FOR INSERT TO authenticated
WITH CHECK (
  reviewer_id = auth.uid()
  AND workspace_id IS NOT NULL
  AND public.can_review_plugin(plugin_id, workspace_id)
);

CREATE POLICY "plugin_reviews licensed buyer update"
ON public.plugin_reviews FOR UPDATE TO authenticated
USING (reviewer_id = auth.uid())
WITH CHECK (
  reviewer_id = auth.uid()
  AND workspace_id IS NOT NULL
  AND public.can_review_plugin(plugin_id, workspace_id)
);
