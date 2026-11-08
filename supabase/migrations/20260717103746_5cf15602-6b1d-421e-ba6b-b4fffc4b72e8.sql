
-- Harden SECURITY DEFINER helpers: revoke EXECUTE from anon on functions that require an authenticated caller.
-- Role-check helpers stay executable by authenticated (needed by RLS policies) but not by anon.

REVOKE EXECUTE ON FUNCTION public.heartbeat() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.regenerate_recovery_codes() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revoke_all_other_sessions(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.transfer_organization_ownership(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.transfer_workspace_ownership(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.accept_workspace_invitation(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_login_attempt(uuid, text, inet, text, text, text) FROM anon, public;

-- Role/permission check helpers: only needed by authenticated (RLS runs as caller's role).
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, workspace_role[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, org_role[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_permissions(uuid, uuid) FROM anon, public;

-- Ensure authenticated retains execute on helpers used by policies / app code.
GRANT EXECUTE ON FUNCTION public.heartbeat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_recovery_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_workspace_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(uuid, text, inet, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, workspace_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, org_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions(uuid, uuid) TO authenticated;
