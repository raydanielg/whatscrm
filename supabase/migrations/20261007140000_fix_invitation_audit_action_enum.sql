-- tg_workspace_invitations_audit() (20260922075657_20260922140000_fix_audit_triggers_cascade_deletes.sql)
-- writes 'invitation_sent' / 'invitation_accepted' / 'invitation_revoked' /
-- 'invitation_expired' / 'invitation_resent' / 'invitation_deleted' into
-- audit_logs.action, but the audit_action enum was never extended with them
-- (it only has create/update/delete/login/logout/invite/revoke/export/access).
-- Every INSERT/UPDATE/DELETE on workspace_invitations fires this trigger,
-- which fails with "invalid input value for enum audit_action" and rolls
-- back the whole statement — so sending, accepting, revoking, resending, or
-- deleting an invitation has been completely broken since that migration,
-- surfaced to the UI as a generic "Could not send invitation" toast.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_sent';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_accepted';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_revoked';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_expired';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_resent';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_deleted';
