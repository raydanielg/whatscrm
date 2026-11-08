
REVOKE EXECUTE ON FUNCTION public.assign_conversation(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auto_assign_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_sla_to_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_assign_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sla_to_conversation(uuid) TO authenticated;
