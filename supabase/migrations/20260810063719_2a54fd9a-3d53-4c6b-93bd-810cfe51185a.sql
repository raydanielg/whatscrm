DROP POLICY IF EXISTS "Members view payment methods" ON public.payment_methods;
CREATE POLICY "Billing roles view payment methods" ON public.payment_methods
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]));