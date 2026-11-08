DROP POLICY IF EXISTS "pl events anon insert view" ON public.commerce_payment_link_events;
CREATE POLICY "pl events anon insert view"
ON public.commerce_payment_link_events
FOR INSERT
TO anon
WITH CHECK (
  event_type = ANY (ARRAY['viewed'::text, 'payment_started'::text])
  AND EXISTS (
    SELECT 1 FROM public.commerce_payment_links pl
    WHERE pl.id = commerce_payment_link_events.payment_link_id
      AND pl.workspace_id = commerce_payment_link_events.workspace_id
  )
);

DROP POLICY IF EXISTS "vcard views insert" ON public.vcard_views;
CREATE POLICY "vcard views insert"
ON public.vcard_views
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vcards v
    WHERE v.id = vcard_views.vcard_id
      AND v.is_public = true
      AND v.revoked_at IS NULL
  )
);